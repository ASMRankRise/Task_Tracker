const nodemailer = require("nodemailer");

const createTransporter = () => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return null;
    }

    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === "true"
        : port === 465;

    try {
        return nodemailer.createTransport({
            host,
            port,
            secure,
            connectionTimeout: 8000,
            greetingTimeout: 8000,
            socketTimeout: 10000,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
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
    const transport = createTransporter();
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
    const project = escapeHtml(projectName || "Project");
    const priority = escapeHtml(task.priority || "low");
    const assigner = escapeHtml(assignedBy || "Team Admin");
    const appUrl = (process.env.CLIENT_URL || "").replace(/\/$/, "");
    const fromName = process.env.EMAIL_FROM_NAME || "Task Tracker";

    const ctaHtml = appUrl
        ? `<p style="margin-top:24px;">
              <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">
                Open Task Tracker
              </a>
            </p>`
        : "";

    const ctaText = appUrl
        ? `View and manage this task: ${appUrl}`
        : "Please login to your Task Tracker to view the task.";

    try {
        const info = await transport.sendMail({
            from: `"${fromName}" <${process.env.EMAIL_USER}>`,
            to,
            subject: `New Task Assigned: ${task.title}`,
            text: `A new task has been assigned to you.

Task: ${task.title}
Description: ${task.description || "No description"}
Project: ${projectName || "Project"}
Priority: ${task.priority || "low"}
Due Date: ${dueDate}
Assigned By: ${assignedBy || "Team Admin"}

${ctaText}`,
            html: `
      <div style="background:#f4f5f7;padding:30px;font-family:Arial,sans-serif;">
        <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;">
          <div style="background:#2563eb;padding:24px;color:#ffffff;">
            <h2 style="margin:0;">${escapeHtml(fromName)}</h2>
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

            ${ctaHtml}

            <p style="margin-top:28px;color:#6b7280;font-size:14px;">
              Please login to your Task Tracker to view and manage this task.
            </p>
          </div>
        </div>
      </div>
    `,
        });
        console.log(`[Mailer] Task assignment email sent to ${to} (${info?.messageId || "ok"})`);
        return info;
    } catch (error) {
        console.warn(`[Mailer] Failed to send email to ${to}:`, error.message || error);
        return null;
    } finally {
        if (typeof transport.close === "function") {
            transport.close();
        }
    }
};

const sendTaskAssignmentEmails = async ({
    recipients = [],
    task,
    projectName,
    assignedBy,
}) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return [];
    }

    const uniqueEmails = [
        ...new Set(
            recipients
                .map((member) => (typeof member === "string" ? member : member?.email))
                .filter((email) => typeof email === "string" && email.trim())
                .map((email) => email.trim().toLowerCase()),
        ),
    ];

    if (!uniqueEmails.length) {
        return [];
    }

    return Promise.allSettled(
        uniqueEmails.map((email) =>
            sendTaskAssignmentEmail({
                to: email,
                task,
                projectName,
                assignedBy,
            }),
        ),
    );
};

module.exports = { sendTaskAssignmentEmail, sendTaskAssignmentEmails };
