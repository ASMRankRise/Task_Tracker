const nodemailer = require("nodemailer");

let transporter = null;

const getTransporter = () => {
    if (transporter) return transporter;
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return null;
    }
    try {
        transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            family: 4,
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 5000,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
        return transporter;
    } catch (err) {
        console.warn("[Mailer] Failed to initialize transport:", err.message);
        return null;
    }
};

const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[char]);

const sendTaskAssignmentEmail = async ({
    to,
    task,
    projectName,
    assignedBy,
}) => {
    const transport = getTransporter();
    if (!transport) {
        return null;
    }

    const dueDate = task.dueDate
        ? new Date(task.dueDate).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        })
        : "Not specified";

    const title = escapeHtml(task.title);
    const description = escapeHtml(task.description || "No description");
    const project = escapeHtml(projectName);
    const priority = escapeHtml(task.priority);
    const assigner = escapeHtml(assignedBy);

    try {
        return await transport.sendMail({
            from: `"Project Management" <${process.env.EMAIL_USER}>`,
            to,
            subject: `New Task Assigned: ${task.title}`,
            text: `A new task has been assigned to you.

Task: ${task.title}
Description: ${task.description || "No description"}
Project: ${projectName}
Priority: ${task.priority}
Due Date: ${dueDate}
Assigned By: ${assignedBy}

Please login to your Project Management System to view the task.`,
            html: `
      <div style="background:#f4f5f7;padding:30px;font-family:Arial,sans-serif;">
        <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;">
          <div style="background:#2563eb;padding:24px;color:#ffffff;">
            <h2 style="margin:0;">Project Management</h2>
            <p style="margin:8px 0 0;">New task assigned to you</p>
          </div>

          <div style="padding:28px;">
            <h2 style="color:#111827;margin-top:0;">${title}</h2>
            <p style="color:#6b7280;">${description}</p>

            <table style="width:100%;border-collapse:collapse;margin-top:24px;">
              <tr>
                <td style="padding:12px 0;color:#6b7280;">Project</td>
                <td style="padding:12px 0;color:#111827;font-weight:bold;">${project}</td>
              </tr>
              <tr>
                <td style="padding:12px 0;color:#6b7280;">Priority</td>
                <td style="padding:12px 0;color:#111827;font-weight:bold;">${priority}</td>
              </tr>
              <tr>
                <td style="padding:12px 0;color:#6b7280;">Due Date</td>
                <td style="padding:12px 0;color:#111827;font-weight:bold;">${dueDate}</td>
              </tr>
              <tr>
                <td style="padding:12px 0;color:#6b7280;">Assigned By</td>
                <td style="padding:12px 0;color:#111827;font-weight:bold;">${assigner}</td>
              </tr>
            </table>

            <p style="margin-top:28px;color:#6b7280;font-size:14px;">
              Please login to your Project Management System to view and manage this task.
            </p>
          </div>
        </div>
      </div>
    `,
        });
    } catch (error) {
        console.warn(`[Mailer] Failed to send email to ${to}:`, error.message || error);
        return null;
    }
};

module.exports = { sendTaskAssignmentEmail };
