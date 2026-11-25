const {
  Query,
  D1Document,
  getDatabase,
  createId,
  idOf,
  nowIso,
  toIso,
  toDate,
  placeholders,
  sqlLike,
  getUsersByIds,
} = require("../db/d1");
const Project = require("./ProjectRepository");

const mapTask = (row) => {
  if (!row) return null;
  const task = new D1Document(repository, {
    _id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    project: row.project_id,
    assignedTo: [],
    createdBy: row.created_by,
    assignedAt: toDate(row.assigned_at),
    submittedBy: row.submitted_by,
    submittedAt: toDate(row.submitted_at),
    scheduledStartAt: toDate(row.scheduled_start_at),
    startedAt: toDate(row.started_at),
    dueDate: toDate(row.due_date),
    completedAt: toDate(row.completed_at),
    doneAt: toDate(row.done_at),
    timeSpentSeconds: Number(row.time_spent_seconds || 0),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  });
  return task;
};

const assigneeMapForTasks = async (taskIds) => {
  if (!taskIds.length) return new Map();
  const db = getDatabase();
  const { results = [] } = await db
    .prepare(
      `SELECT task_id, user_id FROM task_assignees
       WHERE task_id IN (${placeholders(taskIds)})`,
    )
    .bind(...taskIds)
    .all();
  const map = new Map(taskIds.map((id) => [id, []]));
  for (const row of results) map.get(row.task_id)?.push(row.user_id);
  return map;
};

const condition = (filter, values) => {
  const clauses = [];
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === "$or" || key === "$and") {
      const joiner = key === "$or" ? " OR " : " AND ";
      const nested = value.map((item) => condition(item, values)).filter(Boolean);
      if (nested.length) clauses.push(`(${nested.join(joiner)})`);
    } else if (key === "_id") {
      if (value?.$in) {
        const ids = value.$in.map((item) => String(idOf(item)));
        if (!ids.length) {
          clauses.push("0 = 1");
        } else {
          clauses.push(`t.id IN (${placeholders(ids)})`);
          values.push(...ids);
        }
      } else {
        clauses.push("t.id = ?");
        values.push(String(idOf(value)));
      }
    } else if (key === "project") {
      if (value?.$in) {
        const ids = value.$in.map((item) => String(idOf(item)));
        if (!ids.length) {
          clauses.push("0 = 1");
        } else {
          clauses.push(`t.project_id IN (${placeholders(ids)})`);
          values.push(...ids);
        }
      } else {
        clauses.push("t.project_id = ?");
        values.push(String(idOf(value)));
      }
    } else if (key === "assignedTo") {
      clauses.push(
        "EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)",
      );
      values.push(String(idOf(value)));
    } else if (key === "createdBy") {
      clauses.push("t.created_by = ?");
      values.push(String(idOf(value)));
    } else if (["status", "priority"].includes(key)) {
      clauses.push(`t.${key} = ?`);
      values.push(value);
    } else if (["title", "description"].includes(key) && value?.$regex !== undefined) {
      clauses.push(`t.${key} LIKE ? ESCAPE '\\' COLLATE NOCASE`);
      values.push(`%${sqlLike(value.$regex)}%`);
    }
  }
  return clauses.join(" AND ");
};

const normalizePopulate = (specification, select) => {
  if (Array.isArray(specification)) return specification;
  if (typeof specification === "string") return [{ path: specification, select }];
  return [specification];
};

const populateMany = async (tasks, specification) => {
  const specs = normalizePopulate(specification).filter(Boolean);
  const paths = new Set(specs.map((item) => item.path));
  if (paths.has("project")) {
    const projectIds = [...new Set(tasks.map((task) => String(idOf(task.project))))].filter(Boolean);
    const projects = projectIds.length ? await Project.find({ _id: { $in: projectIds } }) : [];
    const projectMap = new Map(projects.map((project) => [String(project._id), project]));
    for (const task of tasks) task.project = projectMap.get(String(idOf(task.project))) || null;
  }
  const userIds = [];
  for (const task of tasks) {
    if (paths.has("assignedTo")) userIds.push(...task.assignedTo.map(idOf));
    if (paths.has("createdBy")) userIds.push(idOf(task.createdBy));
    if (paths.has("submittedBy")) userIds.push(idOf(task.submittedBy));
  }
  const users = await getUsersByIds(userIds);
  for (const task of tasks) {
    if (paths.has("assignedTo")) {
      task.assignedTo = task.assignedTo
        .map((id) => users.get(String(idOf(id))))
        .filter(Boolean);
    }
    if (paths.has("createdBy")) {
      task.createdBy = users.get(String(idOf(task.createdBy))) || null;
    }
    if (paths.has("submittedBy")) {
      task.submittedBy = task.submittedBy
        ? users.get(String(idOf(task.submittedBy))) || null
        : null;
    }
  }
};

const fetchTasks = async (filter, options = {}, single = false) => {
  const db = getDatabase();
  const values = [];
  const where = condition(filter, values);
  let order = "";
  if (options.sort) {
    if (options.sort.createdAt) {
      order = ` ORDER BY t.created_at ${options.sort.createdAt === -1 ? "DESC" : "ASC"}`;
    } else if (options.sort.updatedAt) {
      order = ` ORDER BY t.updated_at ${options.sort.updatedAt === -1 ? "DESC" : "ASC"}`;
    } else if (options.sort.dueDate) {
      order = ` ORDER BY t.due_date ${options.sort.dueDate === -1 ? "DESC" : "ASC"}`;
    }
  }
  const limit =
    options.limit !== null && options.limit !== undefined
      ? ` LIMIT ${Math.max(0, Number(options.limit) || 0)}`
      : single
        ? " LIMIT 1"
        : "";
  const offset = options.skip ? ` OFFSET ${Math.max(0, options.skip)}` : "";
  const statement = db
    .prepare(
      `SELECT t.* FROM tasks t${where ? ` WHERE ${where}` : ""}${order}${limit}${offset}`,
    )
    .bind(...values);
  const rows = single
    ? [await statement.first()].filter(Boolean)
    : (await statement.all()).results || [];
  const tasks = rows.map(mapTask);
  const assignees = await assigneeMapForTasks(tasks.map((task) => task._id));
  for (const task of tasks) task.assignedTo = assignees.get(task._id) || [];
  if (options.populate?.length) await populateMany(tasks, options.populate);
  return single ? tasks[0] || null : tasks;
};

const repository = {
  find(filter = {}) {
    return new Query((options) => fetchTasks(filter, options));
  },

  findById(id) {
    return new Query((options) => fetchTasks({ _id: id }, options, true));
  },

  async create(values) {
    const db = getDatabase();
    const timestamp = nowIso();
    const id = values._id ? String(idOf(values._id)) : createId();
    const assigneeIds = [
      ...new Set((values.assignedTo || []).map((item) => String(idOf(item)))),
    ];
    await db.batch([
      db
        .prepare(
          `INSERT INTO tasks (
             id, title, description, status, priority, project_id, created_by,
             assigned_at, submitted_by, submitted_at, scheduled_start_at,
             started_at, due_date, completed_at, done_at, time_spent_seconds,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          values.title,
          values.description || "",
          values.status || "todo",
          values.priority || "low",
          String(idOf(values.project)),
          String(idOf(values.createdBy)),
          toIso(values.assignedAt),
          idOf(values.submittedBy) ? String(idOf(values.submittedBy)) : null,
          toIso(values.submittedAt),
          toIso(values.scheduledStartAt),
          toIso(values.startedAt),
          toIso(values.dueDate),
          toIso(values.completedAt),
          toIso(values.doneAt),
          values.timeSpentSeconds ?? 0,
          timestamp,
          timestamp,
        ),
      ...assigneeIds.map((userId) =>
        db
          .prepare("INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)")
          .bind(id, userId),
      ),
    ]);
    return this.findById(id);
  },

  async save(task) {
    const db = getDatabase();
    const timestamp = nowIso();
    const assigneeIds = [
      ...new Set((task.assignedTo || []).map((item) => String(idOf(item)))),
    ];
    await db.batch([
      db
        .prepare(
          `UPDATE tasks SET
             title = ?, description = ?, status = ?, priority = ?, project_id = ?,
             created_by = ?, assigned_at = ?, submitted_by = ?, submitted_at = ?,
             scheduled_start_at = ?, started_at = ?, due_date = ?, completed_at = ?,
             done_at = ?, time_spent_seconds = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          task.title,
          task.description || "",
          task.status,
          task.priority,
          String(idOf(task.project)),
          String(idOf(task.createdBy)),
          toIso(task.assignedAt),
          idOf(task.submittedBy) ? String(idOf(task.submittedBy)) : null,
          toIso(task.submittedAt),
          toIso(task.scheduledStartAt),
          toIso(task.startedAt),
          toIso(task.dueDate),
          toIso(task.completedAt),
          toIso(task.doneAt),
          task.timeSpentSeconds ?? 0,
          timestamp,
          String(task._id),
        ),
      db.prepare("DELETE FROM task_assignees WHERE task_id = ?").bind(String(task._id)),
      ...assigneeIds.map((userId) =>
        db
          .prepare("INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)")
          .bind(String(task._id), userId),
      ),
    ]);
    task.updatedAt = new Date(timestamp);
  },

  async populate(task, specification, select) {
    await populateMany([task], normalizePopulate(specification, select));
  },

  async countDocuments(filter = {}) {
    const db = getDatabase();
    const values = [];
    const where = condition(filter, values);
    const row = await db
      .prepare(`SELECT COUNT(*) AS count FROM tasks t${where ? ` WHERE ${where}` : ""}`)
      .bind(...values)
      .first();
    return Number(row?.count || 0);
  },

  async aggregate(pipeline) {
    const match = pipeline.find((stage) => stage.$match)?.$match || {};
    const group = pipeline.find((stage) => stage.$group)?.$group;
    const groupField = String(group?._id || "").replace(/^\$/, "");
    if (!["status", "priority"].includes(groupField)) return [];
    const db = getDatabase();
    const values = [];
    const where = condition(match, values);
    const { results = [] } = await db
      .prepare(
        `SELECT t.${groupField} AS value, COUNT(*) AS count
         FROM tasks t${where ? ` WHERE ${where}` : ""}
         GROUP BY t.${groupField}`,
      )
      .bind(...values)
      .all();
    return results.map((row) => ({ _id: row.value, count: Number(row.count) }));
  },

  async updateMany(filter, update) {
    if (!update?.$pull?.assignedTo) return { modifiedCount: 0 };
    const db = getDatabase();
    const projectId = String(idOf(filter.project));
    const userId = String(idOf(update.$pull.assignedTo));
    const result = await db
      .prepare(
        `DELETE FROM task_assignees
         WHERE user_id = ? AND task_id IN (
           SELECT id FROM tasks WHERE project_id = ?
         )`,
      )
      .bind(userId, projectId)
      .run();
    return { modifiedCount: result.meta?.changes || 0 };
  },

  async deleteMany(filter = {}) {
    const tasks = await this.find(filter);
    if (!tasks.length) return { deletedCount: 0 };
    const db = getDatabase();
    const ids = tasks.map((task) => String(task._id));
    await db.batch([
      db
        .prepare(`DELETE FROM comments WHERE task_id IN (${placeholders(ids)})`)
        .bind(...ids),
      db
        .prepare(`DELETE FROM task_activities WHERE task_id IN (${placeholders(ids)})`)
        .bind(...ids),
      db
        .prepare(`DELETE FROM task_assignees WHERE task_id IN (${placeholders(ids)})`)
        .bind(...ids),
      db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders(ids)})`).bind(...ids),
    ]);
    return { deletedCount: ids.length };
  },

  async deleteById(id) {
    return this.deleteMany({ _id: id });
  },
};

module.exports = repository;
