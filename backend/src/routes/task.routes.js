const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth");

const {
  createTask,
  getTasks,
  getTaskById,
  getTaskHistory,
  updateTask,
  deleteTask,
  createComment,
  getComments,
} = require("../controllers/task.controller");

router.post("/", authMiddleware, createTask);

router.get("/", authMiddleware, getTasks);

router.get("/:taskId/history", authMiddleware, getTaskHistory);
router.get("/:taskId", authMiddleware, getTaskById);

router.patch("/:taskId", authMiddleware, updateTask);

router.delete("/:taskId", authMiddleware, deleteTask);

router.post("/:taskId/comments", authMiddleware, createComment);

router.get("/:taskId/comments", authMiddleware, getComments);

module.exports = router;
