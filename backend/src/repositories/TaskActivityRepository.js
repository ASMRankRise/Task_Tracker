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

const encode = (value) =>
  value === null || value === undefined ? null : JSON.stringify(value);

const decode = (value) => {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const mapActivity = (row) =>
  row
    ? new D1Document(repository, {
        _id: row.id,
        task: row.task_id,
        user: row.user_id,
        action: row.action,
        field: row.field,
        oldValue: decode(row.old_value),
        newValue: decode(row.new_value),
        createdAt: toDate(row.created_at),
        updatedAt: toDate(row.updated_at),
      })
    : null;

const populateUsers = async (activities) => {
  const users = await getUsersByIds(activities.map((activity) => idOf(activity.user)));
  for (const activity of activities) {
    activity.user = users.get(String(idOf(activity.user))) || null;
  }
};

const insertStatement = (db, values) => {
  const timestamp = nowIso();
  return db
    .prepare(
      `INSERT INTO task_activities (
         id, task_id, user_id, action, field, old_value, new_value,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      values._id ? String(idOf(values._id)) : createId(),
      String(idOf(values.task)),
      String(idOf(values.user)),
      values.action,
      values.field ?? null,
      encode(values.oldValue),
      encode(values.newValue),
      timestamp,
      timestamp,
    );
};

const repository = {
  find(filter = {}) {
    return new Query(async (options) => {
      const db = getDatabase();
      const values = [];
      const where = filter.task
        ? (values.push(String(idOf(filter.task))), " WHERE task_id = ?")
        : "";
      const order = options.sort?.createdAt
        ? ` ORDER BY created_at ${options.sort.createdAt === -1 ? "DESC" : "ASC"}`
        : "";
      const { results = [] } = await db
        .prepare(`SELECT * FROM task_activities${where}${order}`)
        .bind(...values)
        .all();
      const activities = results.map(mapActivity);
      if (options.populate?.some((item) => item.path === "user")) {
        await populateUsers(activities);
      }
      return activities;
    });
  },

  async create(values) {
    const db = getDatabase();
    const statement = insertStatement(db, values);
    await statement.run();
    return values;
  },

  async insertMany(items) {
    if (!items.length) return [];
    const db = getDatabase();
    await db.batch(items.map((item) => insertStatement(db, item)));
    return items;
  },

  async deleteMany(filter = {}) {
    const db = getDatabase();
    const result = filter.task
      ? await db
          .prepare("DELETE FROM task_activities WHERE task_id = ?")
          .bind(String(idOf(filter.task)))
          .run()
      : await db.prepare("DELETE FROM task_activities").run();
    return { deletedCount: result.meta?.changes || 0 };
  },

  async populate(activity) {
    await populateUsers([activity]);
  },

  async deleteById(id) {
    const db = getDatabase();
    return db.prepare("DELETE FROM task_activities WHERE id = ?").bind(String(id)).run();
  },
};

module.exports = repository;
