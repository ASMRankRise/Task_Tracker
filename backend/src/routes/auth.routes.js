const express = require("express");
const authRateLimit = require("../middleware/authRateLimit");

const router = express.Router();

const {
  register,
  login,
  refresh,
  logout,
  getMe,
} = require("../controllers/auth.controller");

const authMiddleware = require("../middleware/auth");

router.post("/register", authRateLimit, register);
router.post("/login", authRateLimit, login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", authMiddleware, getMe);

module.exports = router;
