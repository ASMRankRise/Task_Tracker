const crypto = require("crypto");

let database = null;

const setDatabase = (db) => {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("Cloudflare D1 binding DB is unavailable");
  }
  database = db;
};

const getDatabase = () => {
  if (!database) {
    throw new Error("Cloudflare D1 binding DB has not been initialized");
  }
  return database;
};

const createId = () => crypto.randomBytes(12).toString("hex");
const isValidId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));
const idOf = (value) => value?._id || value?.id || value || null;
const nowIso = () => new Date().toISOString();
const toIso = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const toDate = (value) => (value ? new Date(value) : null);

const sqlLike = (value) =>
  String(value)
    .replace(/\\([.*+?^${}()|[\]\\])/g, "$1")
    .replace(/[\\%_]/g, "\\$&");

class Query {
  constructor(executor) {
    this.executor = executor;
    this.options = {
      populate: [],
      select: null,
      sort: null,
      skip: 0,
      limit: null,
    };
  }

  select(value) {
    this.options.select = value;
    return this;
  }

  populate(path, select) {
    if (Array.isArray(path)) {
      this.options.populate.push(...path);
    } else if (typeof path === "object") {
      this.options.populate.push(path);
    } else {
      this.options.populate.push({ path, select });
    }
    return this;
  }

  sort(value) {
    this.options.sort = value;
    return this;
  }

  skip(value) {
    this.options.skip = Number(value) || 0;
    return this;
  }

  limit(value) {
    this.options.limit = Number(value);
    return this;
  }

  exec() {
    return this.executor(this.options);
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

class D1Document {
  constructor(repository, values) {
    Object.defineProperty(this, "_repository", {
      value: repository,
      enumerable: false,
      writable: false,
    });
    Object.assign(this, values);
  }

  async save() {
    await this._repository.save(this);
    return this;
  }

  async populate(specification, select) {
    await this._repository.populate(this, specification, select);
    return this;
  }

  async deleteOne() {
    return this._repository.deleteById(this._id);
  }

  toObject() {
    const copy = {};
    for (const [key, value] of Object.entries(this)) {
      copy[key] = value;
    }
    return copy;
  }
}

const placeholders = (values) => values.map(() => "?").join(", ");

const getUsersByIds = async (ids, { includePassword = false } = {}) => {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];
  if (!uniqueIds.length) return new Map();
  const db = getDatabase();
  const { results = [] } = await db
    .prepare(
      `SELECT id, name, email, password, token_version, role, created_at, updated_at
       FROM users WHERE id IN (${placeholders(uniqueIds)})`,
    )
    .bind(...uniqueIds)
    .all();
  return new Map(
    results.map((row) => [
      row.id,
      mapUser(row, { includePassword }),
    ]),
  );
};

const mapUser = (row, { includePassword = false } = {}) => {
  if (!row) return null;
  const user = {
    _id: row.id,
    name: row.name,
    email: row.email,
    tokenVersion: row.token_version,
    role: row.role,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
  if (includePassword) user.password = row.password;
  return user;
};

module.exports = {
  Query,
  D1Document,
  setDatabase,
  getDatabase,
  createId,
  isValidId,
  idOf,
  nowIso,
  toIso,
  toDate,
  sqlLike,
  placeholders,
  mapUser,
  getUsersByIds,
};
