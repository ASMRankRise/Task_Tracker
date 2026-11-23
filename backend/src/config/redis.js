const { Redis } = require("@upstash/redis");

const TIMEOUT = Number(process.env.REDIS_TIMEOUT) || 10000;
const RETRY_DELAY = Number(process.env.REDIS_RETRY_DELAY) || 5000;

const configured =
  Boolean(process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN);

const client = configured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

let unavailableUntil = 0;

if (!configured) {
  console.warn("[Redis] Not configured. Bypassing cache and using D1 directly.");
}

const execute = async (method, args, fallback) => {
  if (!client) return fallback;

  const now = Date.now();
  if (now < unavailableUntil) {
    return fallback;
  }

  let timeoutId;
  try {
    const result = await Promise.race([
      client[method](...args),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Redis request timed out")),
          TIMEOUT
        );
      }),
    ]);
    return result;
  } catch (error) {
    unavailableUntil = Date.now() + RETRY_DELAY;
    console.warn(
      `[Redis] Connection error (${error.message}). Bypassing cache for ${Math.round(RETRY_DELAY / 1000)}s.`
    );
    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
};

module.exports = {
  get: (...args) => execute("get", args, null),
  set: (...args) => execute("set", args, null),
  incr: (...args) => execute("incr", args, null),
  del: (...args) => execute("del", args, null),
};
