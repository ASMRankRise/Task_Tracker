
const Task = require("../models/Task");
const Project = require("../models/Project");
const User = require("../models/User");
const Comment = require("../models/Comment");
const { isValidId } = require("../db/d1");
const crypto = require("crypto");
const redis = require("../config/redis");
const TaskActivity = require("../models/TaskActivity");
const { sendTaskAssignmentEmails } = require("../config/mailer");
const {
  TASK_CACHE_VERSION_KEY,
  getShortId,
  getTaskHistoryVersionKey,
  getTaskHistoryCacheKey,
  invalidateTaskRelatedCaches,
  invalidateTaskHistoryCache,
} = require("../utils/cache");

const formatValue = (val) => {
  if (typeof val === "string" && val.length > 0) {
    return val.charAt(0).toUpperCase() + val.slice(1);
  }
  return val;
};

const getTaskLabel = (task, fallbackId) => {
  if (task?.title) return `"${task.title}"`;
  const id = fallbackId || task?._id;
  return id ? `#${getShortId(id)}` : "#unknown";
};

const validStatuses = ["todo", "in-progress", "completed", "testing", "done"];
const validPriorities = ["low", "medium", "high"];

// CREATE TASK

const createTask = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const rawBody = req.body;
    const body = Array.isArray(rawBody) ? (rawBody[0] || {}) : (rawBody || {});

    const {
      title,
      description,
      status,
      priority,
      project: projectId,
      assignedTo,
      assignToAll,
      dueDate,
      scheduledStartAt,
    } = body;

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        message: "Task title is required",
      });
    }

    if (title.trim().length > 150) {
      return res.status(400).json({
        message: "Task title cannot exceed 150 characters",
      });
    }

    if (
      description &&
      typeof description === "string" &&
      description.trim().length > 1000
    ) {
      return res.status(400).json({
        message: "Task description cannot exceed 1000 characters",
      });
    }

    if (!isValidId(projectId)) {
      return res.status(400).json({
        message: "Valid project ID is required",
      });
    }

    const foundProject = await Project.findById(projectId);

    if (!foundProject) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const isSuperAdmin = role === "superadmin";
    const isOwner = foundProject.owner.toString() === userId.toString();
    const isProjectHead = Boolean(
      foundProject.projectHead &&
      foundProject.projectHead.toString() === userId.toString(),
    );

    if (!isSuperAdmin && !isOwner && !isProjectHead) {
      return res.status(403).json({
        message: "Only Super Admin, Project Owner, or Project Head can create tasks",
      });
    }

    const taskStatus = status ?? "todo";
    const taskPriority = priority ?? "low";

    if (!validStatuses.includes(taskStatus)) {
      return res.status(400).json({
        message: "Invalid status",
        allowed: validStatuses,
      });
    }

    if (!validPriorities.includes(taskPriority)) {
      return res.status(400).json({
        message: "Invalid priority",
        allowed: validPriorities,
      });
    }

    let parsedDueDate = null;
    let parsedScheduledStartAt = null;

    if (dueDate !== undefined && dueDate !== null && dueDate !== "") {
      parsedDueDate = new Date(dueDate);

      if (Number.isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({
          message: "Invalid due date",
        });
      }
    }

    if (
      scheduledStartAt !== undefined &&
      scheduledStartAt !== null &&
      scheduledStartAt !== ""
    ) {
      parsedScheduledStartAt = new Date(scheduledStartAt);

      if (Number.isNaN(parsedScheduledStartAt.getTime())) {
        return res.status(400).json({
          message: "Invalid scheduled start date",
        });
      }
    }

    let assignedUserIds = [];

    const eligibleIds = [
      foundProject.owner.toString(),
      ...(foundProject.projectHead
        ? [foundProject.projectHead.toString()]
        : []),
      ...foundProject.members.map((id) => id.toString()),
    ];

    const uniqueEligibleIds = [...new Set(eligibleIds)];

    if (assignToAll === true) {
      assignedUserIds = uniqueEligibleIds;
    } else if (Array.isArray(assignedTo) && assignedTo.length > 0) {
      const emails = assignedTo.map((email) => {
        if (typeof email !== "string" || !email.trim()) return null;
        return email.trim().toLowerCase();
      });

      if (emails.some((email) => !email)) {
        return res.status(400).json({
          message: "Assigned user email is invalid",
        });
      }

      const uniqueEmails = [...new Set(emails)];

      const users = await User.find({
        email: { $in: uniqueEmails },
      }).select("_id email");

      if (users.length !== uniqueEmails.length) {
        return res.status(404).json({
          message: "One or more assigned users were not found",
        });
      }

      const invalidUser = users.find(
        (user) => !uniqueEligibleIds.includes(user._id.toString()),
      );

      if (invalidUser) {
        return res.status(400).json({
          message: "All assignees must belong to this project",
        });
      }

      assignedUserIds = users.map((user) => user._id);
    } else {
      return res.status(400).json({
        message: "Please assign this task to at least one member",
      });
    }

    const now = new Date();
    const task = await Task.create({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      status: taskStatus,
      priority: taskPriority,
      project: foundProject._id,
      assignedTo: assignedUserIds,
      createdBy: userId,
      assignedAt: assignedUserIds.length > 0 ? now : null,
      submittedBy: null,
      submittedAt: null,
      scheduledStartAt: parsedScheduledStartAt,
      startedAt: taskStatus === "in-progress" ? now : null,
      dueDate: parsedDueDate,
    });
    try {
      await TaskActivity.create({
        task: task._id,
        user: userId,
        action: "created",
        field: "task",
        oldValue: null,
        newValue: task.title,
      });
    } catch (error) {
      console.error(`[Task] Activity log failed for ${getTaskLabel(task)}:`, error.message || error);
    }

    await task.populate([
      { path: "project", select: "name owner projectHead" },
      { path: "assignedTo", select: "name email" },
      { path: "createdBy", select: "name email" },
      { path: "submittedBy", select: "name email" },
    ]);

    try {
      await sendTaskAssignmentEmails({
        recipients: task.assignedTo || [],
        task,
        projectName: task.project?.name || foundProject.name,
        assignedBy: task.createdBy?.name || "Team Admin",
      });
    } catch (err) {
      console.warn("[Task] Email notification error:", err.message || err);
    }

    await invalidateTaskRelatedCaches(task._id, task.title);
    console.log(`[Task] Task created — ${getTaskLabel(task)} (#${getShortId(task._id)})`);

    return res.status(201).json({
      message: "Task created successfully",
      task,
    });
  } catch (error) {
    console.error("[Task] Create task error:", error.message || error);
    return res.status(500).json({
      message: "Failed to create task",
    });
  }
};



// GET TASKS
const getTasks = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const {
      status,
      priority,
      search,
      assignedTo,
      project,
      page = 1,
      limit = 10,
    } = req.query;

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
        allowed: validStatuses,
      });
    }

    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({
        message: "Invalid priority",
        allowed: validPriorities,
      });
    }

    if (assignedTo && !isValidId(assignedTo)) {
      return res.status(400).json({
        message: "Invalid assigned user ID",
      });
    }

    if (project && !isValidId(project)) {
      return res.status(400).json({
        message: "Invalid project ID",
      });
    }

    const filter = {};
    const isSuperAdmin = role === "superadmin";

    if (!isSuperAdmin) {
      const projects = await Project.find({
        $or: [
          { owner: userId },
          { members: userId },
          { projectHead: userId },
        ],
      }).select("_id");

      const userProjectIds = projects.map((item) => item._id.toString());

      if (project) {
        if (!userProjectIds.includes(project.toString())) {
          return res.status(403).json({
            message: "You can only view tasks from projects you belong to",
          });
        }

        filter.project = project;
      } else {
        filter.project = {
          $in: projects.map((item) => item._id),
        };
      }

      if (assignedTo) {
        filter.assignedTo = assignedTo;
      }
    } else {
      if (project) filter.project = project;
      if (assignedTo) filter.assignedTo = assignedTo;
    }

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    if (search && search.trim()) {
      const escapedSearch = search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            {
              title: {
                $regex: escapedSearch,
                $options: "i",
              },
            },
            {
              description: {
                $regex: escapedSearch,
                $options: "i",
              },
            },
          ],
        },
      ];
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const cacheParams = {
      userId: userId.toString(),
      role,
      status: status || "",
      priority: priority || "",
      search: search?.trim() || "",
      assignedTo: assignedTo || "",
      project: project || "",
      page: pageNumber,
      limit: limitNumber,
    };

    const cacheHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(cacheParams))
      .digest("hex");

    let cacheKey = null;
    let cacheVersion = null;

    try {
      cacheVersion = (await redis.get(TASK_CACHE_VERSION_KEY)) ?? 0;
      cacheKey = `tasks:v${cacheVersion}:user:${userId}:role:${role}:${cacheHash}`;

      const cachedTasks = await redis.get(cacheKey);

      if (cachedTasks !== null) {
        console.log("[Redis] Tasks list cache HIT");
        return res.status(200).json(cachedTasks);
      }

      console.log("[Redis] Tasks list cache MISS");
    } catch (error) {
      console.error("[Redis] Tasks list cache read error:", error.message || error);
      cacheKey = null;
    }

    let taskQuery = Task.find(filter)
      .populate("project", "name owner projectHead")
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email");

    if (typeof taskQuery.populate === "function") {
      try {
        const nextQuery = taskQuery.populate("submittedBy", "name email");
        if (nextQuery && typeof nextQuery.sort === "function") {
          taskQuery = nextQuery;
        }
      } catch {
        // mock chain compatibility
      }
    }

    const [rawTasks, totalTasks] = await Promise.all([
      taskQuery
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber),
      Task.countDocuments(filter),
    ]);

    const tasks = rawTasks.map((t) => {
      const taskObj = t.toObject();

      if (isSuperAdmin) return taskObj;

      const pOwner =
        taskObj.project?.owner?.toString?.() || taskObj.project?.owner;
      const pHead =
        taskObj.project?.projectHead?.toString?.() ||
        taskObj.project?.projectHead;

      const isOwner = pOwner === userId.toString();
      const isHead = pHead === userId.toString();

      if (isOwner || isHead) {
        return taskObj;
      }

      const isAssigned =
        Array.isArray(taskObj.assignedTo) &&
        taskObj.assignedTo.some(
          (u) => (u._id || u).toString() === userId.toString(),
        );

      const sanitizedProject = taskObj.project
        ? {
          _id: taskObj.project._id,
          name: taskObj.project.name,
        }
        : undefined;

      if (isAssigned) {
        return {
          _id: taskObj._id,
          title: taskObj.title,
          description: taskObj.description,
          status: taskObj.status,
          priority: taskObj.priority,
          dueDate: taskObj.dueDate,
          project: sanitizedProject,
          assignedTo: (taskObj.assignedTo || []).map((u) => ({
            _id: u._id,
            name: u.name,
          })),
          createdBy: taskObj.createdBy
            ? {
              _id: taskObj.createdBy._id,
              name: taskObj.createdBy.name,
            }
            : undefined,
          createdAt: taskObj.createdAt,
          assignedAt: taskObj.assignedAt,
          submittedBy: taskObj.submittedBy
            ? {
              _id: taskObj.submittedBy._id,
              name: taskObj.submittedBy.name,
            }
            : null,
          submittedAt: taskObj.submittedAt,
          updatedAt: taskObj.updatedAt,
        };
      }

      return {
        _id: taskObj._id,
        title: taskObj.title,
        description: "",
        status: taskObj.status,
        priority: taskObj.priority,
        dueDate: taskObj.dueDate,
        project: sanitizedProject,
        assignedTo: [],
        createdAt: taskObj.createdAt,
        updatedAt: taskObj.updatedAt,
      };
    });

    const responseData = {
      count: tasks.length,
      totalTasks,
      currentPage: pageNumber,
      totalPages: Math.ceil(totalTasks / limitNumber),
      tasks,
    };

    if (cacheKey) {
      try {
        const latestVersion = (await redis.get(TASK_CACHE_VERSION_KEY)) ?? 0;

        if (String(latestVersion) === String(cacheVersion)) {
          await redis.set(cacheKey, responseData, {
            ex: 60,
          });

          console.log("[Redis] Tasks list cached successfully — TTL: 60s");
        }
      } catch (error) {
        console.error("[Redis] Tasks list cache write error:", error.message || error);
      }
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("[Task] Get tasks error:", error.message || error);
    return res.status(500).json({
      message: "Failed to fetch tasks",
    });
  }
};

// GET TASK BY ID
const getTaskById = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { taskId } = req.params;

    if (!isValidId(taskId)) {
      return res.status(400).json({
        message: "Invalid task ID",
      });
    }

    const query = Task.findById(taskId)
      .populate("project", "name owner projectHead members")
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email");

    const task =
      typeof query?.populate === "function"
        ? await query.populate("submittedBy", "name email")
        : await query;

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    if (role === "superadmin") {
      return res.status(200).json({ task });
    }

    const project = task.project;

    if (!project) {
      return res.status(404).json({
        message: "Associated project not found",
      });
    }

    const pOwner = project.owner?.toString?.() || project.owner;
    const pHead = project.projectHead?.toString?.() || project.projectHead;

    const isOwner = pOwner === userId.toString();
    const isHead = pHead === userId.toString();

    const isAssigned =
      Array.isArray(task.assignedTo) &&
      task.assignedTo.some(
        (u) => (u._id || u).toString() === userId.toString(),
      );

    const isMember =
      Array.isArray(project.members) &&
      project.members.some(
        (m) => (m._id || m.id || m).toString() === userId.toString(),
      );

    if (!isOwner && !isHead && !isAssigned) {
      if (isMember) {
        return res.status(403).json({
          message:
            "Members can only view task details for tasks assigned to them",
        });
      }

      return res.status(403).json({
        message: "You do not have permission to view this task",
      });
    }

    if (isOwner || isHead) {
      return res.status(200).json({ task });
    }

    const sanitizedTask = {
      _id: task._id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      project: {
        _id: project._id,
        name: project.name,
      },
      assignedTo: (task.assignedTo || []).map((u) => ({
        _id: u._id,
        name: u.name,
      })),
      createdBy: task.createdBy
        ? {
          _id: task.createdBy._id,
          name: task.createdBy.name,
        }
        : undefined,
      createdAt: task.createdAt,
      assignedAt: task.assignedAt,
      submittedBy: task.submittedBy
        ? {
          _id: task.submittedBy._id,
          name: task.submittedBy.name,
        }
        : null,
      submittedAt: task.submittedAt,
      updatedAt: task.updatedAt,
    };

    return res.status(200).json({
      task: sanitizedTask,
    });
  } catch (error) {
    console.error(`[Task] Get task by ID error (#${getShortId(req.params.taskId)}):`, error.message || error);
    return res.status(500).json({
      message: "Failed to fetch task details",
    });
  }
};


const getTaskHistory = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { taskId } = req.params;

    if (!isValidId(taskId)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    const task = await Task.findById(taskId).populate(
      "project",
      "owner projectHead members"
    );

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (role !== "superadmin") {
      const project = task.project;

      if (!project) {
        return res.status(404).json({
          message: "Associated project not found",
        });
      }

      const isOwner = project.owner?.toString() === userId.toString();
      const isHead = project.projectHead?.toString() === userId.toString();
      const isAssigned =
        Array.isArray(task.assignedTo) &&
        task.assignedTo.some(
          (user) => (user._id || user).toString() === userId.toString()
        );

      if (!isOwner && !isHead && !isAssigned) {
        return res.status(403).json({
          message: "You do not have permission to view this task history",
        });
      }
    }

    let cacheKey = null;
    let cacheVersion = null;
    const taskLabel = getTaskLabel(task, taskId);

    try {
      const versionKey = getTaskHistoryVersionKey(taskId);
      const rawVersion = await redis.get(versionKey);
      cacheVersion =
        rawVersion !== null && rawVersion !== undefined
          ? Number(rawVersion) || 0
          : 0;
      cacheKey = getTaskHistoryCacheKey(taskId, cacheVersion);

      const cachedHistory = await redis.get(cacheKey);

      if (cachedHistory !== null) {
        console.log(`[Redis] Task history cache HIT — Task: ${taskLabel}`);
        const responseData =
          typeof cachedHistory === "string"
            ? JSON.parse(cachedHistory)
            : cachedHistory;
        return res.status(200).json(responseData);
      }

      console.log(`[Redis] Task history cache MISS — Task: ${taskLabel}`);
    } catch (error) {
      console.error(
        `[Redis] Task history cache read error — Task: ${taskLabel}:`,
        error.message || error
      );
      cacheKey = null;
    }

    const activities = await TaskActivity.find({ task: taskId })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    const responseData = { activities };

    if (cacheKey) {
      try {
        const versionKey = getTaskHistoryVersionKey(taskId);
        const rawLatestVersion = await redis.get(versionKey);
        const latestVersion =
          rawLatestVersion !== null && rawLatestVersion !== undefined
            ? Number(rawLatestVersion) || 0
            : 0;

        if (latestVersion === cacheVersion) {
          const saveResult = await redis.set(cacheKey, responseData, {
            ex: 60,
          });
          if (saveResult === "OK") {
            console.log("[Redis] Task history cached successfully — TTL: 60s");
          } else {
            console.warn(
              `[Redis] Task history cache save failed — Task: ${taskLabel} (${saveResult})`
            );
          }
        } else {
          console.log(
            `[Redis] Task history cache version conflict (${cacheVersion} -> ${latestVersion}) — Task: ${taskLabel}, skipping write`
          );
        }
      } catch (error) {
        console.error(
          `[Redis] Task history cache write error — Task: ${taskLabel}:`,
          error.message || error
        );
      }
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error(`[Task] Get task history error (#${getShortId(req.params?.taskId)}):`, error.message || error);
    return res.status(500).json({
      message: "Failed to fetch task history",
    });
  }
};


// UPDATE TASK


const updateTask = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { taskId } = req.params;

    if (!isValidId(taskId)) {
      return res.status(400).json({
        message: "Invalid task ID",
      });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const previousStatus = task.status;
    const previousPriority = task.priority;

    const previousDueDate = task.dueDate
      ? new Date(task.dueDate).toISOString()
      : null;

    const previousScheduledStartAt = task.scheduledStartAt
      ? new Date(task.scheduledStartAt).toISOString()
      : null;

    const previousAssignedIds = (task.assignedTo || [])
      .map((user) => (user._id || user).toString())
      .sort();

    const project = await Project.findById(task.project);

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const isSuperAdmin = role === "superadmin";
    const isProjectOwner =
      project.owner?.toString() === userId.toString();
    const isProjectHead =
      project.projectHead?.toString() === userId.toString();

    const isAssignedUser =
      Array.isArray(task.assignedTo) &&
      task.assignedTo.some(
        (id) => (id._id || id).toString() === userId.toString(),
      );

    const canManage =
      isSuperAdmin || isProjectOwner || isProjectHead;

    const {
      title,
      description,
      status,
      priority,
      dueDate,
      scheduledStartAt,
      assignedTo,
    } = req.body;

    if (!canManage && !isAssignedUser) {
      return res.status(403).json({
        message: "You can only update tasks assigned to you",
      });
    }

    if (!canManage) {
      const keys = Object.keys(req.body);

      if (keys.length !== 1 || keys[0] !== "status") {
        return res.status(403).json({
          message: "Members can only update task status",
        });
      }
    }

    if (status !== undefined) {
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          message: "Invalid status",
          allowed: validStatuses,
        });
      }

      if (status !== task.status) {
        const statusOrder = [
          "todo",
          "in-progress",
          "testing",
          "completed",
          "done",
        ];

        const currentIndex = statusOrder.indexOf(task.status);
        const nextIndex = statusOrder.indexOf(status);

        if (currentIndex === -1 || currentIndex === 4) {
          return res.status(400).json({
            message: "This task status cannot be changed",
          });
        }

        if (nextIndex !== currentIndex + 1) {
          return res.status(400).json({
            message: "Task must follow the correct status sequence",
            currentStatus: task.status,
            allowedNextStatus: statusOrder[currentIndex + 1] || null,
          });
        }

        const now = new Date();

        if (status === "in-progress" && !task.startedAt) {
          task.startedAt = now;
        }

        if (status === "completed") {
          task.completedAt = now;

          task.timeSpentSeconds = task.startedAt
            ? Math.max(
              0,
              Math.floor(
                (now.getTime() - task.startedAt.getTime()) / 1000,
              ),
            )
            : 0;

          if (!canManage) {
            task.submittedBy = userId;
            task.submittedAt = now;
          }
        }

        if (status === "done") {
          task.doneAt = now;
        }

        task.status = status;
      }
    }

    if (canManage) {
      if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) {
          return res.status(400).json({
            message: "Task title cannot be empty",
          });
        }

        if (title.trim().length > 150) {
          return res.status(400).json({
            message: "Task title cannot exceed 150 characters",
          });
        }

        task.title = title.trim();
      }

      if (description !== undefined) {
        if (typeof description !== "string") {
          return res.status(400).json({
            message: "Description must be a string",
          });
        }

        if (description.trim().length > 1000) {
          return res.status(400).json({
            message: "Task description cannot exceed 1000 characters",
          });
        }

        task.description = description.trim();
      }

      if (priority !== undefined) {
        if (!validPriorities.includes(priority)) {
          return res.status(400).json({
            message: "Invalid priority",
            allowed: validPriorities,
          });
        }

        task.priority = priority;
      }

      if (dueDate !== undefined) {
        if (dueDate === null || dueDate === "") {
          task.dueDate = null;
        } else {
          const parsedDueDate = new Date(dueDate);

          if (Number.isNaN(parsedDueDate.getTime())) {
            return res.status(400).json({
              message: "Invalid due date",
            });
          }

          task.dueDate = parsedDueDate;
        }
      }

      if (scheduledStartAt !== undefined) {
        if (scheduledStartAt === null || scheduledStartAt === "") {
          task.scheduledStartAt = null;
        } else {
          const parsedScheduledStartAt = new Date(scheduledStartAt);

          if (Number.isNaN(parsedScheduledStartAt.getTime())) {
            return res.status(400).json({
              message: "Invalid scheduled start date",
            });
          }

          task.scheduledStartAt = parsedScheduledStartAt;
        }
      }

      if (assignedTo !== undefined) {
        if (!Array.isArray(assignedTo) || assignedTo.length === 0) {
          return res.status(400).json({
            message: "At least one assignee is required",
          });
        }

        const eligibleIds = [
          project.owner.toString(),
          ...(project.projectHead
            ? [project.projectHead.toString()]
            : []),
          ...project.members.map((id) => id.toString()),
        ];

        const uniqueEligibleIds = [...new Set(eligibleIds)];

        const emails = assignedTo.map((email) =>
          typeof email === "string" ? email.trim().toLowerCase() : "",
        );

        if (emails.some((email) => !email)) {
          return res.status(400).json({
            message: "Assigned user email is invalid",
          });
        }

        const uniqueEmails = [...new Set(emails)];

        const users = await User.find({
          email: { $in: uniqueEmails },
        }).select("_id email");

        if (users.length !== uniqueEmails.length) {
          return res.status(404).json({
            message: "One or more assigned users were not found",
          });
        }

        if (
          users.some(
            (user) => !uniqueEligibleIds.includes(user._id.toString()),
          )
        ) {
          return res.status(400).json({
            message: "All assignees must belong to this project",
          });
        }

        const newAssignedIds = users.map((user) => user._id.toString());
        const currentAssignedIds = task.assignedTo.map((id) =>
          id.toString(),
        );

        const assignmentChanged =
          newAssignedIds.length !== currentAssignedIds.length ||
          newAssignedIds.some((id) => !currentAssignedIds.includes(id));

        if (assignmentChanged) {
          task.assignedAt = new Date();
        }

        task.assignedTo = users.map((user) => user._id);
      }
    }

    await task.save();
    const activities = [];
    const taskLabel = getTaskLabel(task, task._id);

    if (previousStatus !== task.status) {
      console.log(`[Task] Status updated — ${taskLabel}: ${formatValue(previousStatus)} → ${formatValue(task.status)}`);
      activities.push({
        task: task._id,
        user: userId,
        action: "status_changed",
        field: "status",
        oldValue: previousStatus,
        newValue: task.status,
      });
    }

    if (previousPriority !== task.priority) {
      console.log(`[Task] Priority updated — ${taskLabel}: ${formatValue(previousPriority)} → ${formatValue(task.priority)}`);
      activities.push({
        task: task._id,
        user: userId,
        action: "priority_changed",
        field: "priority",
        oldValue: previousPriority,
        newValue: task.priority,
      });
    }

    const currentDueDate = task.dueDate
      ? new Date(task.dueDate).toISOString()
      : null;

    if (previousDueDate !== currentDueDate) {
      console.log(`[Task] Due date updated — ${taskLabel}`);
      activities.push({
        task: task._id,
        user: userId,
        action: "due_date_changed",
        field: "dueDate",
        oldValue: previousDueDate,
        newValue: currentDueDate,
      });
    }

    const currentScheduledStartAt = task.scheduledStartAt
      ? new Date(task.scheduledStartAt).toISOString()
      : null;

    if (previousScheduledStartAt !== currentScheduledStartAt) {
      console.log(`[Task] Schedule updated — ${taskLabel}`);
      activities.push({
        task: task._id,
        user: userId,
        action: "schedule_changed",
        field: "scheduledStartAt",
        oldValue: previousScheduledStartAt,
        newValue: currentScheduledStartAt,
      });
    }

    const currentAssignedIds = (task.assignedTo || [])
      .map((user) => (user._id || user).toString())
      .sort();

    if (
      JSON.stringify(previousAssignedIds) !==
      JSON.stringify(currentAssignedIds)
    ) {
      console.log(`[Task] Assignees updated — ${taskLabel}`);
      activities.push({
        task: task._id,
        user: userId,
        action: "assigned",
        field: "assignedTo",
        oldValue: previousAssignedIds,
        newValue: currentAssignedIds,
      });
    }

    if (activities.length) {
      try {
        await TaskActivity.insertMany(activities);
      } catch (error) {
        console.error(`[Task] Activity log failed for ${taskLabel}:`, error.message || error);
      }
    }
    await invalidateTaskRelatedCaches(task._id, task.title);

    await task.populate([
      { path: "project", select: "name owner projectHead" },
      { path: "assignedTo", select: "name email" },
      { path: "createdBy", select: "name email" },
      { path: "submittedBy", select: "name email" },
    ]);

    const newlyAssignedMembers = (task.assignedTo || []).filter(
      (member) =>
        member?.email &&
        !previousAssignedIds.includes((member._id || member).toString()),
    );

    if (newlyAssignedMembers.length > 0 && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const assigner = await User.findById(userId).select("name");
        await sendTaskAssignmentEmails({
          recipients: newlyAssignedMembers,
          task,
          projectName: task.project?.name || project.name,
          assignedBy: assigner?.name || task.createdBy?.name || "Team Admin",
        });
      } catch (err) {
        console.warn("[Task] Reassignment email notification error:", err.message || err);
      }
    }

    return res.status(200).json({
      message: "Task updated successfully",
      task,
    });
  } catch (error) {
    console.error(`[Task] Update task error (#${getShortId(req.params?.taskId)}):`, error.message || error);

    return res.status(500).json({
      message: "Failed to update task",
    });
  }
};



// DELETE TASK
const deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!isValidId(taskId)) {
      return res.status(400).json({
        message: "Invalid task ID",
      });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const project = await Project.findById(task.project);

    const isSuperAdmin = req.user.role === "superadmin";

    const isProjectOwner = Boolean(
      project &&
      project.owner &&
      project.owner.toString() === req.user.userId,
    );

    const isProjectHead = Boolean(
      project &&
      project.projectHead &&
      project.projectHead.toString() === req.user.userId,
    );

    if (!isSuperAdmin && !isProjectOwner && !isProjectHead) {
      return res.status(403).json({
        message:
          "Only Super Admin, Project Owner, or Project Head can delete tasks",
      });
    }

    const taskLabel = getTaskLabel(task, task._id);

    await Comment.deleteMany({
      task: task._id,
    });

    await TaskActivity.deleteMany({
      task: task._id,
    });

    await task.deleteOne();
    await invalidateTaskRelatedCaches(task._id, task.title);
    console.log(`[Task] Task deleted — ${taskLabel}`);

    return res.status(200).json({
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error(`[Task] Delete task error (#${getShortId(req.params?.taskId)}):`, error.message || error);
    return res.status(500).json({
      message: "Failed to delete task",
    });
  }
};

// CREATE COMMENT
const createComment = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { taskId } = req.params;
    const { content } = req.body;

    if (!isValidId(taskId)) {
      return res.status(400).json({
        message: "Invalid task ID",
      });
    }

    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        message: "Comment content is required",
      });
    }

    if (content.trim().length > 1000) {
      return res.status(400).json({
        message: "Comment cannot exceed 1000 characters",
      });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const project = await Project.findById(task.project);

    if (!project) {
      return res.status(404).json({
        message: "Associated project not found",
      });
    }

    const isSuperAdmin = role === "superadmin";
    const isOwner = Boolean(
      project.owner && project.owner.toString() === userId.toString(),
    );
    const isProjectHead = Boolean(
      project.projectHead &&
      project.projectHead.toString() === userId.toString(),
    );

    if (!isSuperAdmin && !isOwner && !isProjectHead) {
      return res.status(403).json({
        message:
          "Only Super Admin, Project Owner, or Project Head can add comments",
      });
    }

    const comment = await Comment.create({
      content: content.trim(),
      task: task._id,
      project: project._id,
      user: userId,
    });

    await comment.populate("user", "name email");
    await invalidateTaskRelatedCaches(task._id, task.title);
    console.log(`[Task] Comment added — ${getTaskLabel(task, task._id)}`);

    return res.status(201).json({
      message: "Comment added successfully",
      comment,
    });
  } catch (error) {
    console.error(`[Task] Create comment error (#${getShortId(req.params?.taskId)}):`, error.message || error);
    return res.status(500).json({
      message: "Failed to add comment",
    });
  }
};

// GET COMMENTS
const getComments = async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { taskId } = req.params;

    if (!isValidId(taskId)) {
      return res.status(400).json({
        message: "Invalid task ID",
      });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const project = await Project.findById(task.project);

    if (!project) {
      return res.status(404).json({
        message: "Associated project not found",
      });
    }

    const isSuperAdmin = role === "superadmin";
    const isOwner = Boolean(
      project.owner && project.owner.toString() === userId.toString(),
    );
    const isProjectHead = Boolean(
      project.projectHead &&
      project.projectHead.toString() === userId.toString(),
    );

    const isAssigned =
      Array.isArray(task.assignedTo) &&
      task.assignedTo.some(
        (u) => (u._id || u).toString() === userId.toString(),
      );

    if (!isSuperAdmin && !isOwner && !isProjectHead && !isAssigned) {
      return res.status(403).json({
        message:
          "Members can only view comments for tasks assigned to them",
      });
    }

    const comments = await Comment.find({
      task: task._id,
    })
      .populate("user", "name email")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      count: comments.length,
      comments,
    });
  } catch (error) {
    console.error(`[Task] Get comments error (#${getShortId(req.params?.taskId)}):`, error.message || error);
    return res.status(500).json({
      message: "Failed to fetch comments",
    });
  }
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  getTaskHistory,
  updateTask,
  deleteTask,
  createComment,
  getComments,
};
