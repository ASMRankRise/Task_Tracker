const {
  Query,
  D1Document,
  getDatabase,
  createId,
  idOf,
  nowIso,
  mapUser,
  placeholders,
} = require("../db/d1");

const includePassword = (select) =>
  typeof select === "string" && select.split(/\s+/).includes("+password");

const wrap = (row, options = {}) => {
  const mapped = mapUser(row, {
    includePassword: includePassword(options.select),
  });
  return mapped ? new D1Document(repository, mapped) : null;
};

const buildWhere = (filter = {}) => {
  const clauses = [];
  const values = [];
  if (filter.email !== undefined) {
    if (filter.email?.$in) {
      if (!filter.email.$in.length) {
        clauses.push("0 = 1");
      } else {
        clauses.push(`email IN (${placeholders(filter.email.$in)})`);
        values.push(...filter.email.$in);
      }
    } else {
      clauses.push("email = ? COLLATE NOCASE");
      values.push(filter.email);
    }
  }
  if (filter.role !== undefined) {
    clauses.push("role = ?");
    values.push(filter.role);
  }
  if (filter._id !== undefined) {
    clauses.push("id = ?");
    values.push(String(idOf(filter._id)));
  }
  return {
    sql: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
};

const repository = {
  find(filter = {}) {
    return new Query(async (options) => {
      const db = getDatabase();
      const where = buildWhere(filter);
      const direction = options.sort?.createdAt === -1 ? " DESC" : " ASC";
      const order = options.sort?.createdAt ? ` ORDER BY created_at${direction}` : "";
      const { results = [] } = await db
        .prepare(
          `SELECT id, name, email, password, token_version, role, created_at, updated_at
           FROM users${where.sql}${order}`,
        )
        .bind(...where.values)
        .all();
      return results.map((row) => wrap(row, options));
    });
  },

  findOne(filter = {}) {
    return new Query(async (options) => {
      const db = getDatabase();
      const where = buildWhere(filter);
      const row = await db
        .prepare(
          `SELECT id, name, email, password, token_version, role, created_at, updated_at
           FROM users${where.sql} LIMIT 1`,
        )
        .bind(...where.values)
        .first();
      return wrap(row, options);
    });
  },

  findById(id) {
    return this.findOne({ _id: id });
  },

  async create(values) {
    const db = getDatabase();
    const timestamp = nowIso();
    const id = values._id ? String(idOf(values._id)) : createId();
    await db
      .prepare(
        `INSERT INTO users
         (id, name, email, password, token_version, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        values.name,
        values.email,
        values.password,
        values.tokenVersion ?? 0,
        values.role || "user",
        timestamp,
        timestamp,
      )
      .run();
    return this.findById(id).select("+password");
  },

  async save(user) {
    const db = getDatabase();
    const timestamp = nowIso();
    if (user.password) {
      await db
        .prepare(
          `UPDATE users
           SET name = ?, email = ?, password = ?, token_version = ?, role = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          user.name,
          user.email,
          user.password,
          user.tokenVersion ?? 0,
          user.role,
          timestamp,
          String(user._id),
        )
        .run();
    } else {
      await db
        .prepare(
          `UPDATE users
           SET name = ?, email = ?, token_version = ?, role = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          user.name,
          user.email,
          user.tokenVersion ?? 0,
          user.role,
          timestamp,
          String(user._id),
        )
        .run();
    }
    user.updatedAt = new Date(timestamp);
  },

  async findByIdAndUpdate(id, update) {
    const db = getDatabase();
    if (update?.$inc?.tokenVersion) {
      await db
        .prepare(
          `UPDATE users
           SET token_version = token_version + ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(update.$inc.tokenVersion, nowIso(), String(id))
        .run();
    }
    return this.findById(id);
  },

  async countDocuments(filter = {}) {
    const db = getDatabase();
    const where = buildWhere(filter);
    const row = await db
      .prepare(`SELECT COUNT(*) AS count FROM users${where.sql}`)
      .bind(...where.values)
      .first();
    return Number(row?.count || 0);
  },

  async populate() {},
};

module.exports = repository;
