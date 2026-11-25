const nodemailer = require("nodemailer");

let socketConnector = null;

const setSocketConnector = (connector) => {
    socketConnector = typeof connector === "function" ? connector : null;
};

const encodeHeaderUtf8 = (value = "") =>
    `=?UTF-8?B?${Buffer.from(String(value), "utf8").toString("base64")}?=`;

const chunkBase64 = (value = "") =>
    Buffer.from(String(value), "utf8")
        .toString("base64")
        .replace(/.{1,76}/g, "$&\r\n")
        .trimEnd();

const sendViaCloudflareSocket = async ({
    host,
    port,
    user,
    pass,
    from,
    to,
    subject,
    text,
    html,
}) => {
    const sock = socketConnector(
        { hostname: host, port },
        { secureTransport: "on" },
    );
    const reader = sock.readable.getReader();
    const writer = sock.writable.getWriter();
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    let buf = "";

    const readReply = async () => {
        while (true) {
            const lines = buf.split("\r\n");
            for (let i = 0; i < lines.length - 1; i++) {
                const line = lines[i];
                if (/^\d{3} /.test(line)) {
                    const reply = lines.slice(0, i + 1).join("\r\n");
                    buf = lines.slice(i + 1).join("\r\n");
                    return { code: Number(line.slice(0, 3)), text: reply };
                }
            }
            const { value, done } = await reader.read();
            if (done) throw new Error("SMTP connection closed unexpectedly");
            buf += dec.decode(value, { stream: true });
        }
    };

    const cmd = async (line, expectedCodes) => {
        await writer.write(enc.encode(line + "\r\n"));
        const res = await readReply();
        if (!expectedCodes.includes(res.code)) {
            throw new Error(`SMTP error (${res.code}): ${res.text}`);
        }
        return res;
    };

    try {
        const greet = await readReply();
        if (greet.code !== 220) {
            throw new Error(`Unexpected SMTP greeting (${greet.code}): ${greet.text}`);
        }

        await cmd("EHLO tasktracker.asmrankrise.in", [250]);
        await cmd("AUTH LOGIN", [334]);
        await cmd(Buffer.from(user, "utf8").toString("base64"), [334]);
        await cmd(Buffer.from(pass, "utf8").toString("base64"), [235]);
        await cmd(`MAIL FROM:<${user}>`, [250]);
        await cmd(`RCPT TO:<${to}>`, [250, 251]);
        await cmd("DATA", [354]);

        const boundary = `----=_Part_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@tasktracker.asmrankrise.in>`;
        const mime = [
            `From: ${from}`,
            `To: <${to}>`,
            `Subject: ${encodeHeaderUtf8(subject)}`,
            `Date: ${new Date().toUTCString()}`,
            `Message-ID: ${messageId}`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            ``,
            `--${boundary}`,
            `Content-Type: text/plain; charset=UTF-8`,
            `Content-Transfer-Encoding: base64`,
            ``,
            chunkBase64(text),
            `--${boundary}`,
            `Content-Type: text/html; charset=UTF-8`,
            `Content-Transfer-Encoding: base64`,
            ``,
            chunkBase64(html),
            `--${boundary}--`,
            ``,
        ].join("\r\n");

        const dataRes = await cmd(`${mime}\r\n.`, [250]);
        await cmd("QUIT", [221]).catch(() => {});
        return { messageId, response: dataRes.text };
    } finally {
        try {
            reader.releaseLock();
        } catch {}
        try {
            writer.releaseLock();
        } catch {}
        await sock.close().catch(() => {});
    }
};

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
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
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

    const from = `"${fromName}" <${process.env.EMAIL_USER}>`;
    const subject = `New Task Assigned: ${task.title}`;
    const text = `A new task has been assigned to you.

Task: ${task.title}
Description: ${task.description || "No description"}
Project: ${projectName || "Project"}
Priority: ${task.priority || "low"}
Due Date: ${dueDate}
Assigned By: ${assignedBy || "Team Admin"}

${ctaText}`;
    const html = `
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
    `;

    if (socketConnector) {
        const host = process.env.SMTP_HOST || "smtp.gmail.com";
        const port = Number(process.env.SMTP_PORT || 465);
        try {
            const info = await sendViaCloudflareSocket({
                host,
                port,
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
                from,
                to,
                subject,
                text,
                html,
            });
            console.log(`[Mailer] Task assignment email sent via Cloudflare socket to ${to} (${info?.messageId || "ok"})`);
            return info;
        } catch (error) {
            console.warn(`[Mailer] Failed to send email via Cloudflare socket to ${to}:`, error.message || error);
            return null;
        }
    }

    const transport = createTransporter();
    if (!transport) {
        return null;
    }

    try {
        const info = await transport.sendMail({
            from,
            to,
            subject,
            text,
            html,
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

module.exports = {
    sendTaskAssignmentEmail,
    sendTaskAssignmentEmails,
    setSocketConnector,
};
