const redis = require("../config/redis");

const PROJECT_CACHE_VERSION_KEY = "cache:projects:version";
const TASK_CACHE_VERSION_KEY = "cache:tasks:version";
const DASHBOARD_CACHE_VERSION_KEY = "cache:dashboard:version";

const getShortId = (id) => (id ? String(id?._id || id).slice(0, 6) : "unknown");

const invalidateCache = async (key, cacheName) => {
  try {
    await redis.incr(key);
    console.log(`[Redis] ${cacheName} cache invalidated`);
  } catch (error) {
    console.error(`[Redis] ${cacheName} cache invalidation error:`, error.message || error);
  }
};

const invalidateProjectsCache = async () => {
  await invalidateCache(PROJECT_CACHE_VERSION_KEY, "Projects");
};

const invalidateTasksCache = async () => {
  await invalidateCache(TASK_CACHE_VERSION_KEY, "Tasks");
};

const invalidateDashboardCache = async () => {
  await invalidateCache(DASHBOARD_CACHE_VERSION_KEY, "Dashboard");
};

const invalidateProjectRelatedCaches = async () => {
  await Promise.all([
    invalidateProjectsCache(),
    invalidateTasksCache(),
    invalidateDashboardCache(),
  ]);
};

const getTaskHistoryVersionKey = (taskId) =>
  `cache:task:${taskId}:history:version`;

const getTaskHistoryCacheKey = (taskId, version = 0) =>
  `task:${taskId}:history:v${Number(version) || 0}`;

const invalidateTaskHistoryCache = async (taskId, taskTitle = null) => {
  const actualId = taskId?._id || taskId;
  if (!actualId) return;
  const actualTitle = taskTitle || taskId?.title || null;
  const versionKey = getTaskHistoryVersionKey(actualId);
  try {
    await redis.incr(versionKey);
    const taskLabel = actualTitle ? `"${actualTitle}"` : `#${getShortId(actualId)}`;
    console.log(`[Redis] Task history invalidated — Task: ${taskLabel}`);
  } catch (error) {
    console.error(`[Redis] Task history cache invalidation error:`, error.message || error);
  }
};

const invalidateTaskRelatedCaches = async (taskId, taskTitle = null) => {
  const actualId = taskId?._id || taskId;
  const actualTitle = taskTitle || taskId?.title || null;
  const promises = [invalidateTasksCache(), invalidateDashboardCache()];
  if (actualId) {
    promises.push(invalidateTaskHistoryCache(actualId, actualTitle));
  }
  await Promise.all(promises);
};

module.exports = {
  PROJECT_CACHE_VERSION_KEY,
  TASK_CACHE_VERSION_KEY,
  DASHBOARD_CACHE_VERSION_KEY,
  getShortId,
  getTaskHistoryVersionKey,
  getTaskHistoryCacheKey,
  invalidateProjectsCache,
  invalidateTasksCache,
  invalidateDashboardCache,
  invalidateProjectRelatedCaches,
  invalidateTaskRelatedCaches,
  invalidateTaskHistoryCache,
};
