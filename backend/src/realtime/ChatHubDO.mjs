import { DurableObject } from "cloudflare:workers";

const HUB_MAX_FRAME_BYTES = 16384;
const MAX_HUDDLE_PARTICIPANTS = 5;

const CALL_RELAY_TYPES = new Set([
  "call:offer",
  "call:answer",
  "call:ice",
  "call:reject",
  "call:hangup",
  "call:busy",
  "call:media_state",
]);

/**
 * Durable Object coordinator for workspace internal chat WebSockets,
 * 1-to-1 WebRTC call signaling, and Mesh group voice huddles.
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

  getHuddleParticipants(conversationId, excludeWs = null) {
    const targetConvId = String(conversationId || "");
    if (!targetConvId) return [];
    const byUser = new Map();
    for (const ws of this.ctx.getWebSockets()) {
      if (excludeWs && ws === excludeWs) continue;
      const meta = ws.deserializeAttachment();
      if (meta?.userId && meta?.huddleConvId === targetConvId) {
        const uid = String(meta.userId);
        if (!byUser.has(uid)) {
          byUser.set(uid, {
            userId: uid,
            userName: String(meta.userName || "Teammate"),
            cameraEnabled: Boolean(meta.cameraEnabled),
            isScreenSharing: Boolean(meta.isScreenSharing),
          });
        }
      }
    }
    return [...byUser.values()];
  }

  getAllActiveHuddles(excludeWs = null) {
    const map = {};
    const seenByConv = new Map();
    for (const ws of this.ctx.getWebSockets()) {
      if (excludeWs && ws === excludeWs) continue;
      const meta = ws.deserializeAttachment();
      if (!meta?.userId || !meta?.huddleConvId) continue;
      const cid = String(meta.huddleConvId);
      const uid = String(meta.userId);
      if (!seenByConv.has(cid)) seenByConv.set(cid, new Set());
      const seen = seenByConv.get(cid);
      if (seen.has(uid)) continue;
      seen.add(uid);
      if (!map[cid]) map[cid] = [];
      map[cid].push({
        userId: uid,
        userName: String(meta.userName || "Teammate"),
        cameraEnabled: Boolean(meta.cameraEnabled),
        isScreenSharing: Boolean(meta.isScreenSharing),
      });
    }
    return map;
  }

  sendToUser(userId, payloadString) {
    for (const targetWs of this.ctx.getWebSockets(String(userId))) {
      try {
        targetWs.send(payloadString);
      } catch {
        // Ignore disconnected socket
      }
    }
  }

  broadcastHuddleStatus(conversationId, participants, recipientIds = null) {
    const payload = JSON.stringify({
      type: "huddle:status",
      conversationId: String(conversationId),
      participants,
    });

    if (Array.isArray(recipientIds) && recipientIds.length > 0) {
      const uniqueIds = [...new Set(recipientIds.filter(Boolean).map(String))];
      for (const uid of uniqueIds) {
        this.sendToUser(uid, payload);
      }
      return;
    }

    for (const sock of this.ctx.getWebSockets()) {
      try {
        sock.send(payload);
      } catch {
        // Ignore disconnected socket
      }
    }
  }

  leaveHuddleForSocket(ws, recipientIds = null, isClosing = false) {
    const meta = ws.deserializeAttachment() || {};
    const convId = meta?.huddleConvId ? String(meta.huddleConvId) : "";
    const userId = meta?.userId ? String(meta.userId) : "";
    if (!convId || !userId) return;

    if (!isClosing) {
      try {
        ws.serializeAttachment({
          ...meta,
          huddleConvId: null,
          cameraEnabled: false,
          isScreenSharing: false,
        });
      } catch {
        // Ignore if socket already closed
      }
    }

    const remaining = this.getHuddleParticipants(convId, isClosing ? ws : null);
    const stillInHuddle = remaining.some((p) => p.userId === userId);

    if (!stillInHuddle) {
      const leftPayload = JSON.stringify({
        type: "huddle:peer_left",
        conversationId: convId,
        userId,
      });
      for (const peer of remaining) {
        this.sendToUser(peer.userId, leftPayload);
      }
    }

    this.broadcastHuddleStatus(convId, remaining, recipientIds);
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
        huddleConvId: null,
      });

      const onlineIds = this.getOnlineUserIds();
      server.send(
        JSON.stringify({
          type: "chat:connected",
          userId: String(userId),
          onlineIds,
          activeHuddles: this.getAllActiveHuddles(),
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
      const senderId = String(meta.userId || "");
      const senderName = String(meta.userName || "Teammate");

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

      if (data?.type === "huddle:sync") {
        ws.send(
          JSON.stringify({
            type: "huddle:snapshot",
            activeHuddles: this.getAllActiveHuddles(),
          }),
        );
        return;
      }

      if (
        data?.type === "typing" &&
        data.conversationId &&
        Array.isArray(data.recipientIds)
      ) {
        if (!senderId) return;

        const targetIds = [
          ...new Set(data.recipientIds.slice(0, 100).filter(Boolean).map(String)),
        ];

        const event = JSON.stringify({
          type: "chat:typing",
          conversationId: String(data.conversationId),
          userId: senderId,
          userName: senderName,
          isTyping: Boolean(data.isTyping),
        });

        for (const uid of targetIds) {
          if (uid === senderId) continue;
          this.sendToUser(uid, event);
        }
        return;
      }

      // ── Group Voice Huddle Room Signaling ────────────────────
      if (data?.type === "huddle:join" && data.conversationId) {
        if (!senderId) return;
        const convId = String(data.conversationId);
        const recipientIds = Array.isArray(data.recipientIds)
          ? [...new Set(data.recipientIds.slice(0, 100).filter(Boolean).map(String))]
          : [];

        if (meta.huddleConvId && meta.huddleConvId !== convId) {
          this.leaveHuddleForSocket(ws, null, false);
        }

        const currentPeers = this.getHuddleParticipants(convId);
        const alreadyIn = currentPeers.some((p) => p.userId === senderId);
        if (!alreadyIn && currentPeers.length >= MAX_HUDDLE_PARTICIPANTS) {
          ws.send(
            JSON.stringify({
              type: "huddle:full",
              conversationId: convId,
              maxParticipants: MAX_HUDDLE_PARTICIPANTS,
            }),
          );
          return;
        }

        ws.serializeAttachment({
          ...meta,
          huddleConvId: convId,
          cameraEnabled: Boolean(data.cameraEnabled),
          isScreenSharing: Boolean(data.isScreenSharing),
        });

        const existingPeers = currentPeers.filter((p) => p.userId !== senderId);
        ws.send(
          JSON.stringify({
            type: "huddle:joined",
            conversationId: convId,
            peers: existingPeers,
          }),
        );

        const peerJoinedPayload = JSON.stringify({
          type: "huddle:peer_joined",
          conversationId: convId,
          userId: senderId,
          userName: senderName,
          cameraEnabled: Boolean(data.cameraEnabled),
          isScreenSharing: Boolean(data.isScreenSharing),
        });
        for (const peer of existingPeers) {
          this.sendToUser(peer.userId, peerJoinedPayload);
        }

        const updatedParticipants = this.getHuddleParticipants(convId);
        const notifyList = [...new Set([...recipientIds, ...updatedParticipants.map((p) => p.userId)])];
        this.broadcastHuddleStatus(convId, updatedParticipants, notifyList);

        if (existingPeers.length === 0 && recipientIds.length > 0) {
          const startedPayload = JSON.stringify({
            type: "huddle:started",
            conversationId: convId,
            startedByUserId: senderId,
            startedByName: senderName,
          });
          for (const uid of recipientIds) {
            if (uid === senderId) continue;
            this.sendToUser(uid, startedPayload);
          }
        }
        return;
      }

      if (data?.type === "huddle:leave") {
        const recipientIds = Array.isArray(data.recipientIds)
          ? [...new Set(data.recipientIds.slice(0, 100).filter(Boolean).map(String))]
          : null;
        this.leaveHuddleForSocket(ws, recipientIds, false);
        return;
      }

      if (data?.type === "huddle:media_state" && data.conversationId) {
        if (!senderId) return;
        const convId = String(data.conversationId);
        const cameraEnabled = Boolean(data.cameraEnabled);
        const isScreenSharing = Boolean(data.isScreenSharing);

        ws.serializeAttachment({
          ...meta,
          cameraEnabled,
          isScreenSharing,
        });

        const payload = JSON.stringify({
          type: "huddle:peer_media",
          conversationId: convId,
          userId: senderId,
          cameraEnabled,
          isScreenSharing,
        });

        for (const peer of this.getHuddleParticipants(convId)) {
          if (peer.userId === senderId) continue;
          this.sendToUser(peer.userId, payload);
        }
        return;
      }

      // ── 1-to-1 & Mesh WebRTC Signaling Relay ─────────────────
      if (CALL_RELAY_TYPES.has(data?.type)) {
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
        const mode = data.mode === "huddle" || data.mode === "renegotiate" ? data.mode : "direct";

        if (data.type === "call:offer" && mode === "direct" && targetSockets.length === 0) {
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
        if (data.mode) relay.mode = String(data.mode);
        if (data.conversationId) relay.conversationId = String(data.conversationId);
        if (data.callType === "video" || data.callType === "audio") {
          relay.callType = data.callType;
        }
        if (data.type === "call:offer" || data.type === "call:answer") {
          relay.sdp = data.sdp;
        }
        if (data.type === "call:ice") {
          relay.candidate = data.candidate;
        }
        if (data.type === "call:media_state") {
          relay.cameraEnabled = Boolean(data.cameraEnabled);
          relay.isScreenSharing = Boolean(data.isScreenSharing);
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
    this.leaveHuddleForSocket(ws, null, true);
    try {
      ws.close();
    } catch {
      // Already closed
    }
    this.broadcastPresence();
  }

  async webSocketError(ws) {
    this.leaveHuddleForSocket(ws, null, true);
    try {
      ws.close();
    } catch {
      // Already closed
    }
    this.broadcastPresence();
  }
}
