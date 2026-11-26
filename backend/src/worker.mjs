import { handleAsNodeRequest } from "cloudflare:node";
import { connect } from "cloudflare:sockets";
import jwt from "jsonwebtoken";

import app from "./app.js";
import d1 from "./db/d1.js";
import mailer from "./config/mailer.js";
import chatBroker from "./realtime/chatBroker.js";

export { ChatHubDO } from "./realtime/ChatHubDO.mjs";

mailer.setSocketConnector(connect);

const port = 8788;
app.listen(port);

const parseCookieToken = (cookieHeader = "", cookieName = "accessToken") => {
  const parts = String(cookieHeader).split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === cookieName) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return "";
};

const authenticateWebSocketRequest = async (request, env) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  const cookieToken = parseCookieToken(request.headers.get("Cookie"), "accessToken");

  if (ticket) {
    try {
      const decoded = jwt.verify(ticket, secret);
      if (decoded?.type !== "ws" || !decoded?.userId) return null;
      return {
        userId: String(decoded.userId),
        userName: String(decoded.name || "Team Member"),
      };
    } catch {
      return null;
    }
  }

  if (cookieToken) {
    try {
      const decoded = jwt.verify(cookieToken, secret);
      if (decoded?.type !== "access" || !decoded?.userId) return null;

      const user = await env.DB.prepare(
        "SELECT id, name, token_version FROM users WHERE id = ? LIMIT 1",
      )
        .bind(String(decoded.userId))
        .first();

      if (!user) return null;
      if ((decoded.tokenVersion ?? 0) !== (user.token_version ?? 0)) {
        return null;
      }

      return {
        userId: String(user.id),
        userName: String(user.name || "Team Member"),
      };
    } catch {
      return null;
    }
  }

  return null;
};

export default {
  async fetch(request, env, ctx) {
    if (env) {
      for (const [key, val] of Object.entries(env)) {
        if (typeof val === "string" && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }

    d1.setDatabase(env.DB);
    chatBroker.setChatHub(env.CHAT_HUB);

    const url = new URL(request.url);
    const isWebSocketUpgrade =
      url.pathname === "/api/chat/ws" &&
      request.headers.get("Upgrade")?.toLowerCase() === "websocket";

    if (isWebSocketUpgrade) {
      const auth = await authenticateWebSocketRequest(request, env);
      if (!auth) {
        return new Response(
          JSON.stringify({ message: "Unauthorized WebSocket connection" }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (!env.CHAT_HUB) {
        return new Response(
          JSON.stringify({ message: "Realtime chat hub binding unavailable" }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        );
      }

      const headers = new Headers(request.headers);
      headers.delete("x-chat-user-id");
      headers.delete("x-chat-user-name");
      headers.set("x-chat-user-id", auth.userId);
      headers.set("x-chat-user-name", auth.userName);

      const stub = env.CHAT_HUB.get(env.CHAT_HUB.idFromName("workspace-main"));
      return stub.fetch(new Request(request, { headers }));
    }

    return handleAsNodeRequest(port, request);
  },
};
