const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { getDatabase } = require("./db/d1");

const authRoutes = require("./routes/auth.routes");
const projectRoutes = require("./routes/project.routes");
const taskRoutes = require("./routes/task.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const adminRoutes = require("./routes/admin.routes");
const chatRoutes = require("./routes/chat.routes");

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const configuredClients = (process.env.CLIENT_URL || "")
        .split(",")
        .map((s) => s.trim().replace(/\/$/, ""))
        .filter(Boolean);

      const allowed = new Set([
        ...configuredClients,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
      ]);

      if (
        allowed.has(origin.replace(/\/$/, "")) ||
        /^https:\/\/[a-z0-9-]+\.pages\.dev$/i.test(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);

// Allow larger JSON payloads specifically for custom sticker uploads (max 200KB binary -> ~275KB base64)
app.use("/api/chat/stickers/custom", express.json({ limit: "350kb" }));
app.use(express.json({ limit: "50kb" }));
app.use(cookieParser());

app.get("/api/health", async (req, res) => {
  try {
    const result = await getDatabase().prepare("SELECT 1 AS healthy").first();
    return res.status(200).json({
      status: result?.healthy === 1 ? "ok" : "degraded",
      database: "d1",
    });
  } catch (error) {
    console.error("Health check failed:", error.message);
    return res.status(503).json({
      status: "unavailable",
      database: "d1",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/chat", chatRoutes);

app.use((err, req, res, next) => {
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? "Internal Server Error"
        : err.message || "Something went wrong",
  });
});

module.exports = app;
