const {
  Query,
  D1Document,
  getDatabase,
  createId,
  idOf,
  nowIso,
  toDate,
  placeholders,
  getUsersByIds,
} = require("../db/d1");

const mapProject = (row) =>
  row
    ? new D1Document(repository, {
        _id: row.id,
        name: row.name,
        description: row.description,
        owner: row.owner_id,
        projectHead: row.project_head_id,
        members: [],
        createdAt: toDate(row.created_at),
        updatedAt: toDate(row.updated_at),
      })
    : null;

const memberMapForProjects = async (projectIds) => {
  if (!projectIds.length) return new Map();
  const db = getDatabase();
  const { results = [] } = await db
    .prepare(
      `SELECT project_id, user_id FROM project_members
       WHERE project_id IN (${placeholders(projectIds)})`,
    )
    .bind(...projectIds)
    .all();
  const map = new Map(projectIds.map((id) => [id, []]));
  for (const row of results) map.get(row.project_id)?.push(row.user_id);
  return map;
};

const condition = (filter, values) => {
  const clauses = [];
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === "$or") {
      const nested = value.map((item) => condition(item, values)).filter(Boolean);
      if (nested.length) clauses.push(`(${nested.join(" OR ")})`);
    } else if (key === "_id") {
      if (value?.$in) {
        const ids = value.$in.map((item) => String(idOf(item)));
        if (!ids.length) {
          clauses.push("0 = 1");
        } else {
          clauses.push(`p.id IN (${placeholders(ids)})`);
          values.push(...ids);
        }
      } else {
        clauses.push("p.id = ?");
        values.push(String(idOf(value)));
      }
    } else if (key === "owner") {
      clauses.push("p.owner_id = ?");
      values.push(String(idOf(value)));
    } else if (key === "projectHead") {
      clauses.push("p.project_head_id = ?");
      values.push(String(idOf(value)));
    } else if (key === "members") {
      clauses.push(
        "EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?)",
      );
      values.push(String(idOf(value)));
    } else if (key === "name") {
      clauses.push("p.name = ?");
      values.push(value);
    }
  }
  return clauses.join(" AND ");
};

const fetchProjects = async (filter, options = {}, single = false) => {
  const db = getDatabase();
  const values = [];
  const where = condition(filter, values);
  const order = options.sort?.createdAt
    ? ` ORDER BY p.created_at ${options.sort.createdAt === -1 ? "DESC" : "ASC"}`
    : "";
  const limit = single ? " LIMIT 1" : "";
  const statement = db
    .prepare(
      `SELECT p.id, p.name, p.description, p.owner_id, p.project_head_id,
              p.created_at, p.updated_at
       FROM projects p${where ? ` WHERE ${where}` : ""}${order}${limit}`,
    )
    .bind(...values);
  const rows = single
    ? [await statement.first()].filter(Boolean)
    : (await statement.all()).results || [];
  const projects = rows.map(mapProject);
  const memberMap = await memberMapForProjects(projects.map((project) => project._id));
  for (const project of projects) {
    project.members = memberMap.get(project._id) || [];
  }
  if (options.populate?.length) await populateMany(projects, options.populate);
  return single ? projects[0] || null : projects;
};

const normalizePopulate = (specification, select) => {
  if (Array.isArray(specification)) return specification;
  if (typeof specification === "string") return [{ path: specification, select }];
  return [specification];
};

const populateMany = async (projects, specification) => {
  const specs = normalizePopulate(specification);
  const paths = new Set(specs.filter(Boolean).map((item) => item.path));
  const ids = [];
  for (const project of projects) {
    if (paths.has("owner")) ids.push(idOf(project.owner));
    if (paths.has("projectHead")) ids.push(idOf(project.projectHead));
    if (paths.has("members")) ids.push(...project.members.map(idOf));
  }
  const users = await getUsersByIds(ids);
  for (const project of projects) {
    if (paths.has("owner")) project.owner = users.get(String(idOf(project.owner))) || null;
    if (paths.has("projectHead")) {
      project.projectHead = project.projectHead
        ? users.get(String(idOf(project.projectHead))) || null
        : null;
    }
    if (paths.has("members")) {
      project.members = project.members
        .map((id) => users.get(String(idOf(id))))
        .filter(Boolean);
    }
  }
};

const repository = {
  find(filter = {}) {
    return new Query((options) => fetchProjects(filter, options));
  },

  findOne(filter = {}) {
    return new Query((options) => fetchProjects(filter, options, true));
  },

  findById(id) {
    return this.findOne({ _id: id });
  },

  async create(values) {
    const db = getDatabase();
    const timestamp = nowIso();
    const id = values._id ? String(idOf(values._id)) : createId();
    const members = [...new Set((values.members || []).map((item) => String(idOf(item))))];
    const statements = [
      db
        .prepare(
          `INSERT INTO projects
           (id, name, description, owner_id, project_head_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          values.name,
          values.description || "",
          String(idOf(values.owner)),
          idOf(values.projectHead) ? String(idOf(values.projectHead)) : null,
          timestamp,
          timestamp,
        ),
      ...members.map((memberId) =>
        db
          .prepare("INSERT INTO project_members (project_id, user_id) VALUES (?, ?)")
          .bind(id, memberId),
      ),
    ];
    await db.batch(statements);
    return this.findById(id);
  },

  async save(project) {
    const db = getDatabase();
    const timestamp = nowIso();
    const memberIds = [
      ...new Set((project.members || []).map((member) => String(idOf(member)))),
    ];
    await db.batch([
      db
        .prepare(
          `UPDATE projects SET name = ?, description = ?, owner_id = ?,
           project_head_id = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          project.name,
          project.description || "",
          String(idOf(project.owner)),
          idOf(project.projectHead) ? String(idOf(project.projectHead)) : null,
          timestamp,
          String(project._id),
        ),
      db
        .prepare("DELETE FROM project_members WHERE project_id = ?")
        .bind(String(project._id)),
      ...memberIds.map((memberId) =>
        db
          .prepare("INSERT INTO project_members (project_id, user_id) VALUES (?, ?)")
          .bind(String(project._id), memberId),
      ),
    ]);
    project.updatedAt = new Date(timestamp);
  },

  async populate(project, specification, select) {
    await populateMany([project], normalizePopulate(specification, select));
  },

  async deleteById(id) {
    const db = getDatabase();
    const projectId = String(id);
    const { results = [] } = await db
      .prepare("SELECT id FROM tasks WHERE project_id = ?")
      .bind(projectId)
      .all();
    const taskIds = results.map((r) => String(r.id));

    const statements = [
      db.prepare("DELETE FROM comments WHERE project_id = ?").bind(projectId),
      db.prepare("DELETE FROM project_members WHERE project_id = ?").bind(projectId),
    ];

    if (taskIds.length) {
      const ph = placeholders(taskIds);
      statements.unshift(
        db.prepare(`DELETE FROM comments WHERE task_id IN (${ph})`).bind(...taskIds),
        db.prepare(`DELETE FROM task_activities WHERE task_id IN (${ph})`).bind(...taskIds),
        db.prepare(`DELETE FROM task_assignees WHERE task_id IN (${ph})`).bind(...taskIds),
        db.prepare(`DELETE FROM tasks WHERE id IN (${ph})`).bind(...taskIds),
      );
    } else {
      statements.push(db.prepare("DELETE FROM tasks WHERE project_id = ?").bind(projectId));
    }

    statements.push(db.prepare("DELETE FROM projects WHERE id = ?").bind(projectId));

    await db.batch(statements);
  },

  async countDocuments(filter = {}) {
    const db = getDatabase();
    const values = [];
    const where = condition(filter, values);
    const row = await db
      .prepare(`SELECT COUNT(*) AS count FROM projects p${where ? ` WHERE ${where}` : ""}`)
      .bind(...values)
      .first();
    return Number(row?.count || 0);
  },
};

module.exports = repository;
