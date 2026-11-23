const User = require("../models/User");
const Project = require("../models/Project");
const Task = require("../models/Task");

const redis = require("../config/redis");

const { DASHBOARD_CACHE_VERSION_KEY } = require("../utils/cache");

const validStatuses = ["todo", "in-progress", "completed", "testing", "done"];
const validPriorities = ["low", "medium", "high"];

const getDashboard = async (req, res) => {
  try {
    const userId = req.user.userId;

    const currentUser = await User.findById(userId).select("role");

    if (!currentUser) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    let version = 0;

    try {
      version = Number(await redis.get(DASHBOARD_CACHE_VERSION_KEY)) || 0;
    } catch (error) {
      console.error("[Redis] Dashboard version error:", error.message || error);
    }

    const cacheKey = `dashboard:v${version}:user:${userId}:role:${currentUser.role}`;

    try {
      const cachedDashboard = await redis.get(cacheKey);

      if (cachedDashboard !== null) {
        console.log("[Redis] Dashboard cache HIT");
        return res.status(200).json(cachedDashboard);
      }

      console.log("[Redis] Dashboard cache MISS");
    } catch (error) {
      console.error("[Redis] Dashboard cache read error:", error.message || error);
    }

    // Set filters: only Super Admin gets global project/task counts.
    // Regular Admins, Project Heads, and Members are scoped to associated projects.
    let projectFilter = {};
    let taskFilter = {};

    const isSuperAdmin = currentUser.role === "superadmin";

    if (!isSuperAdmin) {
      const projects = await Project.find({
        $or: [
          { owner: userId },
          { members: userId },
          { projectHead: userId },
        ],
      }).select("_id");

      const projectIds = projects.map((project) => project._id);

      projectFilter = {
        _id: { $in: projectIds },
      };

      taskFilter = {
        project: { $in: projectIds },
      };
    }

    const [totalProjects, totalTasks, statusResults, priorityResults] =
      await Promise.all([
        Project.countDocuments(projectFilter),

        Task.countDocuments(taskFilter),

        Task.aggregate([
          { $match: taskFilter },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ]),

        Task.aggregate([
          { $match: taskFilter },
          {
            $group: {
              _id: "$priority",
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

    const byStatus = Object.fromEntries(
      validStatuses.map((status) => [status, 0]),
    );

    const byPriority = Object.fromEntries(
      validPriorities.map((priority) => [priority, 0]),
    );

    statusResults.forEach((item) => {
      byStatus[item._id] = item.count;
    });

    priorityResults.forEach((item) => {
      byPriority[item._id] = item.count;
    });

    const summary = {
      totalProjects,
      totalTasks,
    };

    if (currentUser.role === "superadmin" || currentUser.role === "admin") {
      summary.totalUsers = await User.countDocuments();
    }

    if (!isSuperAdmin) {
      const [assignedTasks, createdTasks] = await Promise.all([
        Task.countDocuments({
          ...taskFilter,
          assignedTo: userId,
        }),

        Task.countDocuments({
          ...taskFilter,
          createdBy: userId,
        }),
      ]);

      summary.assignedTasks = assignedTasks;
      summary.createdTasks = createdTasks;
    }

    const responseData = {
      role: currentUser.role,
      summary,
      taskStats: {
        byStatus,
        byPriority,
      },
    };

    try {
      const latestVersion = Number(
        (await redis.get(DASHBOARD_CACHE_VERSION_KEY)) || 0,
      );

      if (version === latestVersion) {
        await redis.set(cacheKey, responseData, {
          ex: 60,
        });
        console.log("[Redis] Dashboard cached successfully — TTL: 60s");
      }
    } catch (error) {
      console.error("[Redis] Dashboard cache write error:", error.message || error);
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("[Dashboard] Get dashboard error:", error.message || error);

    return res.status(500).json({
      message: "Failed to fetch dashboard data",
    });
  }
};

module.exports = {
  getDashboard,
};
