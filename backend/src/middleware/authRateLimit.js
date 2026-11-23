const { Redis } = require("@upstash/redis");
const { Ratelimit } = require("@upstash/ratelimit");

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 30;
const localAttempts = new Map();
let remoteLimiter;

const getRemoteLimiter = () => {
  if (remoteLimiter !== undefined) return remoteLimiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  remoteLimiter =
    url && token
      ? new Ratelimit({
          redis: new Redis({ url, token }),
          limiter: Ratelimit.slidingWindow(LIMIT, "15 m"),
          prefix: "ratelimit:auth",
          analytics: false,
        })
      : null;
  return remoteLimiter;
};

const identifierFor = (req) =>
  req.headers["cf-connecting-ip"] ||
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
  req.ip ||
  "unknown";

const localLimit = (identifier) => {
  const now = Date.now();
  if (localAttempts.size > 500) {
    for (const [key, val] of localAttempts.entries()) {
      if (val.resetAt <= now) localAttempts.delete(key);
    }
  }
  const current = localAttempts.get(identifier);
  if (!current || current.resetAt <= now) {
    localAttempts.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return { success: true, remaining: LIMIT - 1, reset: now + WINDOW_MS };
  }
  current.count += 1;
  return {
    success: current.count <= LIMIT,
    remaining: Math.max(0, LIMIT - current.count),
    reset: current.resetAt,
  };
};

const authRateLimit = async (req, res, next) => {
  try {
    const identifier = identifierFor(req);
    const limiter = getRemoteLimiter();
    const result = limiter
      ? await limiter.limit(identifier)
      : localLimit(identifier);

    res.setHeader("RateLimit-Limit", String(LIMIT));
    res.setHeader("RateLimit-Remaining", String(result.remaining ?? 0));
    if (result.reset) {
      res.setHeader(
        "RateLimit-Reset",
        String(Math.ceil(Number(result.reset) / 1000)),
      );
    }

    if (!result.success) {
      return res.status(429).json({
        success: false,
        message: "Too many attempts. Please try again after 15 minutes.",
      });
    }
    return next();
  } catch (error) {
    console.warn("[RateLimit] Unavailable; allowing request:", error.message);
    return next();
  }
};

module.exports = authRateLimit;
