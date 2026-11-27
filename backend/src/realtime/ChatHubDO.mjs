import { DurableObject } from "cloudflare:workers";

const HUB_MAX_FRAME_BYTES = 16384;

/**
 * Durable Object coordinator for workspace internal chat WebSockets.
 * Uses Cloudflare WebSocket Hibernation so idle clients consume zero compute.
 */
export class ChatHubDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
  }

  getOnlineUserIds() {
    const ids = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment();
      if (meta?.userId) {
        ids.add(String(meta.userId));
      }
    }
    return [...ids];
  }

  broadcastPresence() {
    const onlineIds = this.getOnlineUserIds();
    const payload = JSON.stringify({
      type: "chat:presence",
      onlineIds,
    });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Ignore sockets closing concurrently
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const userId = request.headers.get("x-chat-user-id");
      const userName = request.headers.get("x-chat-user-name") || "Team Member";

      if (!userId) {
        return new Response("Unauthorized", { status: 401 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server, [String(userId)]);
      server.serializeAttachment({
        userId: String(userId),
        userName: String(userName),
      });

      const onlineIds = this.getOnlineUserIds();
      server.send(
        JSON.stringify({
          type: "chat:connected",
          userId: String(userId),
          onlineIds,
        }),
      );

      this.broadcastPresence();

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    if (url.pathname === "/internal/broadcast" && request.method === "POST") {
      try {
        const body = await request.json();
        const { recipientIds = [], event } = body || {};

        if (!event || !Array.isArray(recipientIds) || recipientIds.length === 0) {
          return Response.json({ ok: true, delivered: 0 });
        }

        const payload = JSON.stringify(event);
        const uniqueRecipients = [...new Set(recipientIds.filter(Boolean).map(String))];
        let delivered = 0;

        for (const uid of uniqueRecipients) {
          for (const ws of this.ctx.getWebSockets(uid)) {
            try {
              ws.send(payload);
              delivered++;
            } catch {
              // Ignore closing socket
            }
          }
        }

        return Response.json({ ok: true, delivered });
      } catch (error) {
        return Response.json(
          { ok: false, error: error.message || "Broadcast failed" },
          { status: 400 },
        );
      }
    }

    if (url.pathname === "/internal/online" && request.method === "GET") {
      return Response.json({
        onlineIds: this.getOnlineUserIds(),
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws, rawMessage) {
    try {
      const text =
        typeof rawMessage === "string"
          ? rawMessage
          : new TextDecoder().decode(rawMessage);

      if (!text || text.length > HUB_MAX_FRAME_BYTES) return;

      const data = JSON.parse(text);
      const meta = ws.deserializeAttachment() || {};

      if (data?.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        return;
      }

      if (data?.type === "presence:get") {
        ws.send(
          JSON.stringify({
            type: "chat:presence",
            onlineIds: this.getOnlineUserIds(),
          }),
        );
        return;
      }

      if (
        data?.type === "typing" &&
        data.conversationId &&
        Array.isArray(data.recipientIds)
      ) {
        const senderId = String(meta.userId || "");
        if (!senderId) return;

        const targetIds = [
          ...new Set(data.recipientIds.slice(0, 100).filter(Boolean).map(String)),
        ];

        const event = JSON.stringify({
          type: "chat:typing",
          conversationId: String(data.conversationId),
          userId: senderId,
          userName: meta.userName || "Teammate",
          isTyping: Boolean(data.isTyping),
        });

        for (const uid of targetIds) {
          if (uid === senderId) continue;
          for (const targetWs of this.ctx.getWebSockets(uid)) {
            try {
              targetWs.send(event);
            } catch {
              // Ignore disconnected socket
            }
          }
        }
      }

      // ── Voice-call signaling relay ───────────────────────────
      const CALL_TYPES = new Set([
        "call:offer",
        "call:answer",
        "call:ice",
        "call:reject",
        "call:hangup",
        "call:busy",
      ]);

      if (CALL_TYPES.has(data?.type)) {
        const senderId = String(meta.userId || "");
        const senderName = meta.userName || "Teammate";
        const targetUserId = String(data.targetUserId || "");
        if (!senderId || !targetUserId || senderId === targetUserId) return;

        if (
          (data.type === "call:offer" || data.type === "call:answer") &&
          (!data.sdp || typeof data.sdp !== "object")
        ) {
          return;
        }
        if (
          data.type === "call:ice" &&
          (!data.candidate || typeof data.candidate !== "object")
        ) {
          return;
        }

        const targetSockets = this.ctx.getWebSockets(targetUserId);
        if (data.type === "call:offer" && targetSockets.length === 0) {
          ws.send(
            JSON.stringify({
              type: "call:unavailable",
              targetUserId,
              reason: "offline",
            }),
          );
          return;
        }

        const relay = {
          type: data.type,
          fromUserId: senderId,
          fromUserName: senderName,
        };
        if (data.type === "call:offer" || data.type === "call:answer") {
          relay.sdp = data.sdp;
        }
        if (data.type === "call:ice") {
          relay.candidate = data.candidate;
        }

        const payload = JSON.stringify(relay);
        for (const targetWs of targetSockets) {
          try {
            targetWs.send(payload);
          } catch {
            // Ignore disconnected socket
          }
        }
      }
    } catch {
      // Ignore malformed JSON frames
    }
  }

  async webSocketClose(ws) {
    try {
      ws.close();
    } catch {
      // Already closed
    }
    this.broadcastPresence();
  }

  async webSocketError(ws) {
    try {
      ws.close();
    } catch {
      // Already closed
    }
    this.broadcastPresence();
  }
}
