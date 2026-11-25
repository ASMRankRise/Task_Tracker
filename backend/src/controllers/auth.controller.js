const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getRefreshSecret = () =>
  process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, getRefreshSecret());
  } catch (err) {
    if (process.env.JWT_REFRESH_SECRET && process.env.JWT_SECRET) {
      return jwt.verify(token, process.env.JWT_SECRET);
    }
    throw err;
  }
};

const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  };
};

const getAccessCookieOptions = () => ({
  ...getCookieOptions(),
  maxAge: 15 * 60 * 1000,
});

const getRefreshCookieOptions = () => ({
  ...getCookieOptions(),
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

// REGISTER (Disabled for public; accounts are created exclusively by Super Admin)
const register = async (req, res) => {
  return res.status(403).json({
    message: "Public registration is disabled. Please contact your Super Admin to create an account.",
  });
};

// FORGOT PASSWORD
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        message: "Email address is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address",
      });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      console.log(`[Auth] Password reset requested for ${normalizedEmail}`);
    }

    return res.status(200).json({
      message:
        "If an account is associated with this email, password assistance has been initiated. You may also contact your Super Admin directly to reset your credentials.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
    });
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Invalid email or password",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing");

      return res.status(500).json({
        message: "Server configuration error",
      });
    }

    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const tokenVersion = user.tokenVersion ?? 0;

    const accessToken = jwt.sign(
      {
        userId: user._id.toString(),
        type: "access",
        tokenVersion,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m" },
    );

    const refreshToken = jwt.sign(
      {
        userId: user._id.toString(),
        type: "refresh",
        tokenVersion,
      },
      getRefreshSecret(),
      { expiresIn: process.env.REFRESH_TOKEN_DAYS || "7d" },
    );

    res.cookie("accessToken", accessToken, getAccessCookieOptions());
    res.cookie("refreshToken", refreshToken, getRefreshCookieOptions());

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

// REFRESH ACCESS TOKEN
const refresh = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      message: "Refresh token required. Please login again.",
    });
  }

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Server configuration error",
      });
    }

    const decoded = verifyRefreshToken(refreshToken);

    if (decoded.type !== "refresh") {
      return res.status(401).json({
        message: "Invalid refresh token",
      });
    }

    const user = await User.findById(decoded.userId);

    if (!user || (decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      res.clearCookie("accessToken", getCookieOptions());
      res.clearCookie("refreshToken", getCookieOptions());

      return res.status(401).json({
        message: "Session expired. Please login again.",
      });
    }

    const accessToken = jwt.sign(
      {
        userId: user._id.toString(),
        type: "access",
        tokenVersion: user.tokenVersion ?? 0,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m" },
    );

    const newRefreshToken = jwt.sign(
      {
        userId: user._id.toString(),
        type: "refresh",
        tokenVersion: user.tokenVersion ?? 0,
      },
      getRefreshSecret(),
      { expiresIn: process.env.REFRESH_TOKEN_DAYS || "7d" },
    );

    res.cookie("accessToken", accessToken, getAccessCookieOptions());
    res.cookie("refreshToken", newRefreshToken, getRefreshCookieOptions());

    return res.status(200).json({
      message: "Access token refreshed",
    });
  } catch (error) {
    res.clearCookie("accessToken", getCookieOptions());
    res.clearCookie("refreshToken", getCookieOptions());
    return res.status(401).json({
      message: "Refresh token expired or invalid. Please login again.",
    });
  }
};

// LOGOUT
const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const accessToken = req.cookies?.accessToken || authHeader;
    const refreshToken = req.cookies?.refreshToken;

    let userId = null;

    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);

        if (decoded.type === "access") {
          userId = decoded.userId;
        }
      } catch {
        // Access token might be expired, continue to check refreshToken
      }
    }

    if (!userId && refreshToken) {
      try {
        const decoded = verifyRefreshToken(refreshToken);

        if (decoded.type === "refresh") {
          userId = decoded.userId;
        }
      } catch {
        // Refresh token might be expired
      }
    }

    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $inc: { tokenVersion: 1 },
      });
    }

    res.clearCookie("accessToken", getCookieOptions());
    res.clearCookie("refreshToken", getCookieOptions());

    return res.status(200).json({
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);

    res.clearCookie("accessToken", getCookieOptions());
    res.clearCookie("refreshToken", getCookieOptions());

    return res.status(500).json({
      message: "Logout failed",
    });
  }
};

// GET CURRENT USER
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("name email role");

    if (!user) {
      return res.status(401).json({
        message: "User not found. Please login again.",
      });
    }

    return res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("GetMe error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  refresh,
  logout,
  getMe,
};
