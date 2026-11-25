const User = require("../models/User");
const bcrypt = require("bcryptjs");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Get all registered users
const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("name email role createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({ users });
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Create a new user (Super Admin only)
const createUser = async (req, res) => {
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({
        message: "Only Super Admin can create user accounts",
      });
    }

    const { name, email, password, role = "user" } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        message: "Name, email, and password are required",
      });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({
        message: "Name must be between 2 and 100 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.length > 254 || !emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({
        message: "Password must be between 6 and 128 characters",
      });
    }

    const targetRole = role === "admin" ? "admin" : "user";

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email is already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      role: targetRole,
    });

    return res.status(201).json({
      message: "User account created successfully",
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Create user error:", error);
    if (
      error.code === 11000 ||
      String(error.message).includes("UNIQUE constraint failed: users.email")
    ) {
      return res.status(409).json({
        message: "Email is already registered",
      });
    }
    return res.status(500).json({ message: "Server error" });
  }
};

// Reset a user's password (Super Admin only)
const adminResetPassword = async (req, res) => {
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({
        message: "Only Super Admin can reset user passwords",
      });
    }

    const { email, newPassword } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof newPassword !== "string" ||
      newPassword.length < 6
    ) {
      return res.status(400).json({
        message: "Valid email and new password (min 6 characters) are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    return res.status(200).json({
      message: `Password reset successfully for ${user.email}`,
    });
  } catch (error) {
    console.error("Admin reset password error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Change a user's role
const updateUserRole = async (req, res) => {
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({
        message: "Only Super Admin can change user roles",
      });
    }

    const { email, role } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      !["admin", "user"].includes(role)
    ) {
      return res.status(400).json({
        message: "Valid email and role (admin/user) are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Invalid email format",
      });
    }

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found. Register them first.",
      });
    }

    if (user.role === "superadmin") {
      return res.status(403).json({
        message: "Super Admin accounts cannot be modified or demoted",
      });
    }

    if (user._id.toString() === req.user.userId) {
      return res.status(400).json({
        message: "You cannot modify your own role",
      });
    }

    if (user.role === "admin" && role === "user") {
      const adminCount = await User.countDocuments({ role: "admin" });

      if (adminCount <= 1) {
        return res.status(400).json({
          message: "At least one Admin account must remain",
        });
      }
    }

    user.role = role;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    return res.status(200).json({
      message: `User role updated to ${role}`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Update user role error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getUsers, createUser, adminResetPassword, updateUserRole };
