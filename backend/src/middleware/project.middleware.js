const { isValidId } = require("../db/d1");
const Project = require("../models/Project");

const requireProjectOwner = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    if (!isValidId(projectId)) {
      return res.status(400).json({
        message: "Invalid project ID",
      });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const isSuperAdmin = req.user.role === "superadmin";
    const isOwner = project.owner.toString() === req.user.userId;

    if (!isSuperAdmin && !isOwner) {
      return res.status(403).json({
        message: "You do not have permission to manage this project",
      });
    }

    req.project = project;
    next();
  } catch (error) {
    console.error("Project permission error:", error);

    return res.status(500).json({
      message: "Server error while checking project permissions",
    });
  }
};

module.exports = requireProjectOwner;
