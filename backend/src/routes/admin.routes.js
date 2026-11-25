const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth");
const requireRole = require("../middleware/role");

const {
  getUsers,
  createUser,
  adminResetPassword,
  updateUserRole,
} = require("../controllers/admin.controller");

router.get("/users", authMiddleware, requireRole("admin"), getUsers);
router.post("/users", authMiddleware, requireRole("superadmin"), createUser);
router.post(
  "/users/reset-password",
  authMiddleware,
  requireRole("superadmin"),
  adminResetPassword,
);
router.patch(
  "/users/role",
  authMiddleware,
  requireRole("superadmin"),
  updateUserRole,
);

module.exports = router;
