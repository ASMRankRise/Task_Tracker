const {
  Query,
  D1Document,
  getDatabase,
  createId,
  idOf,
  nowIso,
  toDate,
  getUsersByIds,
} = require("../db/d1");

const mapComment = (row) =>
  row
    ? new D1Document(repository, {
        _id: row.id,
        content: row.content,
        task: row.task_id,
        project: row.project_id,
        user: row.user_id,
        createdAt: toDate(row.created_at),
        updatedAt: toDate(row.updated_at),
      })
    : null;

const whereFor = (filter = {}) => {
  const clauses = [];
  const values = [];
  if (filter.task !== undefined) {
    clauses.push("task_id = ?");
    values.push(String(idOf(filter.task)));
  }
  if (filter.project !== undefined) {
    clauses.push("project_id = ?");
    values.push(String(idOf(filter.project)));
  }
  return {
    sql: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
};

const populateMany = async (comments, specification) => {
  const path =
    typeof specification === "string"
      ? specification
      : Array.isArray(specification)
        ? specification[0]?.path
        : specification?.path;
  if (path !== "user") return;
  const users = await getUsersByIds(comments.map((comment) => idOf(comment.user)));
  for (const comment of comments) {
    comment.user = users.get(String(idOf(comment.user))) || null;
  }
};

const repository = {
  find(filter = {}) {
    return new Query(async (options) => {
      const db = getDatabase();
      const where = whereFor(filter);
      const order = options.sort?.createdAt
        ? ` ORDER BY created_at ${options.sort.createdAt === -1 ? "DESC" : "ASC"}`
        : "";
      const { results = [] } = await db
        .prepare(`SELECT * FROM comments${where.sql}${order}`)
        .bind(...where.values)
        .all();
      const comments = results.map(mapComment);
      if (options.populate?.length) await populateMany(comments, options.populate);
      return comments;
    });
  },

  async create(values) {
    const db = getDatabase();
    const timestamp = nowIso();
    const id = values._id ? String(idOf(values._id)) : createId();
    await db
      .prepare(
        `INSERT INTO comments
         (id, content, task_id, project_id, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        values.content,
        String(idOf(values.task)),
        String(idOf(values.project)),
        String(idOf(values.user)),
        timestamp,
        timestamp,
      )
      .run();
    const row = await db.prepare("SELECT * FROM comments WHERE id = ?").bind(id).first();
    return mapComment(row);
  },

  async populate(comment, specification) {
    await populateMany([comment], specification);
  },

  async deleteMany(filter = {}) {
    const db = getDatabase();
    const where = whereFor(filter);
    const result = await db
      .prepare(`DELETE FROM comments${where.sql}`)
      .bind(...where.values)
      .run();
    return { deletedCount: result.meta?.changes || 0 };
  },

  async deleteById(id) {
    const db = getDatabase();
    return db.prepare("DELETE FROM comments WHERE id = ?").bind(String(id)).run();
  },
};

module.exports = repository;
