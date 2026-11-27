import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import api from "../services/api";
import { useAuth } from "./AuthContext";
import { ChatContext } from "./chatContextDef";

const getEntityId = (entity) => {
  if (!entity) return "";
  if (typeof entity === "object") {
    return String(entity._id || entity.id || entity.userId || "").trim();
  }
  return String(entity).trim();
};

const buildWebSocketUrl = (ticket) => {
  const apiBase = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
  const encodedTicket = encodeURIComponent(ticket);

  if (apiBase.startsWith("http://") || apiBase.startsWith("https://")) {
    const wsBase = apiBase.replace(/^http/, "ws");
    return `${wsBase}/chat/ws?ticket=${encodedTicket}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${apiBase}/chat/ws?ticket=${encodedTicket}`;
};

const mergeMessagesAscending = (existing = [], incoming = []) => {
  const map = new Map();
  for (const m of existing) {
    if (m?._id) map.set(m._id, m);
  }
  for (const m of incoming) {
    if (m?._id) map.set(m._id, m);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
};

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const currentUserId = getEntityId(user);

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [activeConversationId, setActiveConversationIdState] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({});
  const [hasMoreByConv, setHasMoreByConv] = useState({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatUsers, setChatUsers] = useState([]);
  const [onlineIds, setOnlineIds] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [typingByConv, setTypingByConv] = useState({});
  const [customStickers, setCustomStickers] = useState([]);

  const wsRef = useRef(null);
  const activeConvRef = useRef(null);
  const conversationsRef = useRef([]);
  const messagesRef = useRef({});
  const typingTimersRef = useRef(new Map());
  const lastTypingSentRef = useRef(0);
  const handleWsEventRef = useRef(null);
  const callEventHandlerRef = useRef(null);

  useEffect(() => {
    activeConvRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    messagesRef.current = messagesByConv;
  }, [messagesByConv]);

  const setActiveConversationId = useCallback((id) => {
    activeConvRef.current = id;
    setActiveConversationIdState(id);
  }, []);

  const loadConversations = useCallback(async () => {
    if (!currentUserId) return [];
    setLoadingConversations(true);
    try {
      const res = await api.get("/chat/conversations");
      const list = Array.isArray(res.data?.conversations)
        ? res.data.conversations
        : [];
      setConversations(list);
      if (Array.isArray(res.data?.onlineIds)) {
        setOnlineIds(res.data.onlineIds);
      }
      return list;
    } catch (err) {
      console.error("[Chat] Load conversations failed:", err);
      return [];
    } finally {
      setLoadingConversations(false);
    }
  }, [currentUserId]);

  const loadChatUsers = useCallback(async () => {
    if (!currentUserId) return [];
    try {
      const res = await api.get("/chat/users");
      const users = Array.isArray(res.data?.users) ? res.data.users : [];
      setChatUsers(users);
      if (Array.isArray(res.data?.onlineIds)) {
        setOnlineIds(res.data.onlineIds);
      }
      return users;
    } catch (err) {
      console.error("[Chat] Load chat users failed:", err);
      return [];
    }
  }, [currentUserId]);

  const loadCustomStickers = useCallback(async () => {
    if (!currentUserId) return [];
    try {
      const res = await api.get("/chat/stickers/custom");
      const list = Array.isArray(res.data?.stickers) ? res.data.stickers : [];
      setCustomStickers(list);
      return list;
    } catch (err) {
      console.error("[Chat] Load custom stickers failed:", err);
      return [];
    }
  }, [currentUserId]);

  const uploadCustomSticker = useCallback(async ({ label, dataUrl }) => {
    const res = await api.post("/chat/stickers/custom", { label, dataUrl });
    const sticker = res.data?.sticker;
    if (sticker) {
      setCustomStickers((prev) => [
        sticker,
        ...prev.filter((s) => s.id !== sticker.id),
      ]);
    }
    return sticker;
  }, []);

  const deleteCustomSticker = useCallback(async (fullOrRawId) => {
    const rawId = String(fullOrRawId || "").replace(/^custom\//, "");
    if (!rawId) return;
    await api.delete(`/chat/stickers/custom/${rawId}`);
    const fullId = `custom/${rawId}`;
    setCustomStickers((prev) => prev.filter((s) => s.id !== fullId));
  }, []);

  const markConversationRead = useCallback(async (conversationId) => {
    if (!conversationId) return;
    setConversations((prev) =>
      prev.map((c) => (c._id === conversationId ? { ...c, unreadCount: 0 } : c)),
    );
    try {
      await api.post(`/chat/conversations/${conversationId}/read`);
    } catch {
      // Non-fatal
    }
  }, []);

  const loadMessages = useCallback(
    async (conversationId, { before = null, after = null, limit = 50 } = {}) => {
      if (!conversationId) return { messages: [], hasMore: false };
      if (!after) setLoadingMessages(true);
      try {
        const params = { limit };
        if (before) params.before = before;
        if (after) params.after = after;

        const res = await api.get(
          `/chat/conversations/${conversationId}/messages`,
          { params },
        );
        const fetched = Array.isArray(res.data?.messages) ? res.data.messages : [];
        const hasMore = Boolean(res.data?.hasMore);

        setMessagesByConv((prev) => ({
          ...prev,
          [conversationId]: mergeMessagesAscending(
            prev[conversationId] || [],
            fetched,
          ),
        }));

        if (!after) {
          setHasMoreByConv((prev) => ({
            ...prev,
            [conversationId]: hasMore,
          }));
        }

        return { messages: fetched, hasMore };
      } catch (err) {
        console.error("[Chat] Load messages failed:", err);
        return { messages: [], hasMore: false };
      } finally {
        if (!after) setLoadingMessages(false);
      }
    },
    [],
  );

  // Keep latest incoming WS event handler in ref via effect
  useEffect(() => {
    handleWsEventRef.current = (event) => {
    if (!event || !event.type) return;

    if (event.type === "chat:connected") {
      setWsConnected(true);
      if (Array.isArray(event.onlineIds)) {
        setOnlineIds(event.onlineIds);
      }
      callEventHandlerRef.current?.(event);
      return;
    }

    if (event.type === "chat:presence") {
      if (Array.isArray(event.onlineIds)) {
        setOnlineIds(event.onlineIds);
      }
      return;
    }

    if (event.type === "chat:conversation_created" && event.conversation) {
      setConversations((prev) => {
        if (prev.some((c) => c._id === event.conversation._id)) return prev;
        return [event.conversation, ...prev];
      });
      return;
    }

    if (event.type === "chat:custom_sticker_added" && event.sticker) {
      setCustomStickers((prev) => [
        event.sticker,
        ...prev.filter((s) => s.id !== event.sticker.id),
      ]);
      return;
    }

    if (event.type === "chat:custom_sticker_deleted" && event.stickerId) {
      setCustomStickers((prev) => prev.filter((s) => s.id !== event.stickerId));
      return;
    }

    if (event.type === "chat:message" && event.message) {
      const cid = String(event.conversationId || event.message.conversationId);
      const msg = event.message;
      const isMine = getEntityId(msg.sender) === currentUserId;
      const isViewing = activeConvRef.current === cid;

      setMessagesByConv((prev) => ({
        ...prev,
        [cid]: mergeMessagesAscending(prev[cid] || [], [msg]),
      }));

      // Clear typing indicator for sender
      const senderId = getEntityId(msg.sender);
      setTypingByConv((prev) => {
        const list = prev[cid] || [];
        if (!list.some((u) => u.userId === senderId)) return prev;
        return { ...prev, [cid]: list.filter((u) => u.userId !== senderId) };
      });

      const knownConv = conversationsRef.current.some((c) => c._id === cid);
      if (!knownConv) {
        void loadConversations();
      } else {
        setConversations((prev) => {
          const updated = prev.map((c) => {
            if (c._id !== cid) return c;
            return {
              ...c,
              lastMessageAt: msg.createdAt,
              lastMessagePreview:
                msg.messageType === "sticker" ? "Sticker" : msg.content,
              unreadCount:
                isMine || isViewing ? 0 : Number(c.unreadCount || 0) + 1,
            };
          });
          return updated.sort((a, b) => {
            const ta = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
            const tb = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
            return tb - ta;
          });
        });
      }

      if (isViewing && !isMine) {
        void markConversationRead(cid);
      }
      return;
    }

    if (
      (event.type === "chat:message_updated" ||
        event.type === "chat:message_deleted") &&
      event.message
    ) {
      const cid = String(event.conversationId || event.message.conversationId);
      const msg = event.message;
      setMessagesByConv((prev) => ({
        ...prev,
        [cid]: (prev[cid] || []).map((m) => (m._id === msg._id ? msg : m)),
      }));
      void loadConversations();
      return;
    }

    if (event.type === "chat:read") {
      if (String(event.userId) === currentUserId) {
        setConversations((prev) =>
          prev.map((c) =>
            c._id === event.conversationId ? { ...c, unreadCount: 0 } : c,
          ),
        );
      }
      return;
    }

    if (event.type === "chat:typing" && event.conversationId && event.userId) {
      const cid = String(event.conversationId);
      const uid = String(event.userId);
      if (uid === currentUserId) return;

      const timerKey = `${cid}:${uid}`;
      const existingTimer = typingTimersRef.current.get(timerKey);
      if (existingTimer) clearTimeout(existingTimer);

      if (!event.isTyping) {
        typingTimersRef.current.delete(timerKey);
        setTypingByConv((prev) => ({
          ...prev,
          [cid]: (prev[cid] || []).filter((u) => u.userId !== uid),
        }));
        return;
      }

      setTypingByConv((prev) => {
        const list = prev[cid] || [];
        const filtered = list.filter((u) => u.userId !== uid);
        return {
          ...prev,
          [cid]: [...filtered, { userId: uid, userName: event.userName || "Teammate" }],
        };
      });

      const timeout = setTimeout(() => {
        typingTimersRef.current.delete(timerKey);
        setTypingByConv((prev) => ({
          ...prev,
          [cid]: (prev[cid] || []).filter((u) => u.userId !== uid),
        }));
      }, 4000);
      typingTimersRef.current.set(timerKey, timeout);
    }

    // ── Forward call:* and huddle:* events to CallContext ────────
    if (
      typeof event.type === "string" &&
      (event.type.startsWith("call:") || event.type.startsWith("huddle:"))
    ) {
      callEventHandlerRef.current?.(event);
    }
    };
  }, [currentUserId, loadConversations, markConversationRead]);

  // Manage single persistent WebSocket lifecycle while logged in
  useEffect(() => {
    if (!currentUserId) {
      setConversations([]);
      setMessagesByConv({});
      setOnlineIds([]);
      setCustomStickers([]);
      setWsConnected(false);
      return undefined;
    }

    let disposed = false;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let attempt = 0;
    let hadDisconnected = false;

    void loadConversations();
    void loadCustomStickers();

    const connectSocket = async () => {
      if (disposed) return;

      try {
        const res = await api.post("/chat/ws-ticket");
        const ticket = res.data?.ticket;
        if (!ticket || disposed) return;

        const ws = new WebSocket(buildWebSocketUrl(ticket));
        wsRef.current = ws;

        ws.onopen = () => {
          if (disposed) {
            ws.close();
            return;
          }
          attempt = 0;
          setWsConnected(true);

          if (hadDisconnected) {
            hadDisconnected = false;
            void loadConversations();
            const activeId = activeConvRef.current;
            if (activeId) {
              const currentMsgs = messagesRef.current[activeId] || [];
              const lastMsg = currentMsgs[currentMsgs.length - 1];
              if (lastMsg?.createdAt) {
                void loadMessages(activeId, { after: lastMsg.createdAt });
              } else {
                void loadMessages(activeId);
              }
            }
          }

          if (heartbeatTimer) clearInterval(heartbeatTimer);
          heartbeatTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 25000);
        };

        ws.onmessage = (evt) => {
          try {
            const parsed = JSON.parse(evt.data);
            handleWsEventRef.current?.(parsed);
          } catch {
            // Ignore malformed socket frames
          }
        };

        ws.onclose = () => {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          setWsConnected(false);
          if (disposed) return;

          hadDisconnected = true;
          const delay = Math.min(1500 * 2 ** attempt, 30000);
          attempt += 1;
          reconnectTimer = setTimeout(() => {
            void connectSocket();
          }, delay);
        };

        ws.onerror = () => {
          // Let onclose handle reconnect cleanly
        };
      } catch {
        if (disposed) return;
        setWsConnected(false);
        hadDisconnected = true;
        const delay = Math.min(2000 * 2 ** attempt, 30000);
        attempt += 1;
        reconnectTimer = setTimeout(() => {
          void connectSocket();
        }, delay);
      }
    };

    void connectSocket();

    const timersMap = typingTimersRef.current;

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      for (const timer of timersMap.values()) {
        clearTimeout(timer);
      }
      timersMap.clear();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [currentUserId, loadConversations, loadCustomStickers, loadMessages]);

  const openDirectChat = useCallback(async (recipientId) => {
    const res = await api.post("/chat/conversations/direct", { recipientId });
    const conv = res.data?.conversation;
    if (conv) {
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === conv._id);
        return exists
          ? prev.map((c) => (c._id === conv._id ? conv : c))
          : [conv, ...prev];
      });
    }
    return conv;
  }, []);

  const openProjectChat = useCallback(async (projectId) => {
    const res = await api.post(`/chat/conversations/project/${projectId}`);
    const conv = res.data?.conversation;
    if (conv) {
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === conv._id);
        return exists
          ? prev.map((c) => (c._id === conv._id ? conv : c))
          : [conv, ...prev];
      });
    }
    return conv;
  }, []);

  const createGroupChat = useCallback(async ({ name, participantIds }) => {
    const res = await api.post("/chat/conversations/group", {
      name,
      participantIds,
    });
    const conv = res.data?.conversation;
    if (conv) {
      setConversations((prev) => [
        conv,
        ...prev.filter((c) => c._id !== conv._id),
      ]);
    }
    return conv;
  }, []);

  const sendMessage = useCallback(
    async (
      conversationId,
      {
        content = "",
        messageType = "text",
        stickerId = null,
        taskId = null,
        replyToId = null,
      },
    ) => {
      const payload =
        messageType === "sticker"
          ? {
              messageType: "sticker",
              stickerId,
              ...(taskId ? { taskId } : {}),
              ...(replyToId ? { replyToId } : {}),
            }
          : {
              messageType: "text",
              content,
              ...(taskId ? { taskId } : {}),
              ...(replyToId ? { replyToId } : {}),
            };

      const res = await api.post(
        `/chat/conversations/${conversationId}/messages`,
        payload,
      );
      const msg = res.data?.message;
      if (msg) {
        const preview = msg.messageType === "sticker" ? "Sticker" : msg.content;
        setMessagesByConv((prev) => ({
          ...prev,
          [conversationId]: mergeMessagesAscending(prev[conversationId] || [], [msg]),
        }));
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c._id === conversationId
              ? {
                  ...c,
                  lastMessageAt: msg.createdAt,
                  lastMessagePreview: preview,
                  unreadCount: 0,
                }
              : c,
          );
          return updated.sort((a, b) => {
            const ta = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
            const tb = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
            return tb - ta;
          });
        });
      }
      return msg;
    },
    [],
  );

  const editMessage = useCallback(async (messageId, content) => {
    const res = await api.patch(`/chat/messages/${messageId}`, { content });
    const msg = res.data?.message;
    if (msg) {
      setMessagesByConv((prev) => ({
        ...prev,
        [msg.conversationId]: (prev[msg.conversationId] || []).map((m) =>
          m._id === msg._id ? msg : m,
        ),
      }));
      void loadConversations();
    }
    return msg;
  }, [loadConversations]);

  const deleteMessage = useCallback(async (messageId) => {
    const res = await api.delete(`/chat/messages/${messageId}`);
    const msg = res.data?.message;
    if (msg) {
      setMessagesByConv((prev) => ({
        ...prev,
        [msg.conversationId]: (prev[msg.conversationId] || []).map((m) =>
          m._id === msg._id ? msg : m,
        ),
      }));
      void loadConversations();
    }
    return msg;
  }, [loadConversations]);

  const sendTyping = useCallback((conversationId, isTyping = true) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !conversationId) return;

    if (isTyping) {
      const now = Date.now();
      if (now - lastTypingSentRef.current < 1500) return;
      lastTypingSentRef.current = now;
    }

    const conv = conversationsRef.current.find((c) => c._id === conversationId);
    const recipientIds = (conv?.participants || []).map((p) => p._id);
    if (!recipientIds.length) return;

    ws.send(
      JSON.stringify({
        type: "typing",
        conversationId,
        recipientIds,
        isTyping,
      }),
    );
  }, []);

  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (sum, conv) => sum + Number(conv.unreadCount || 0),
        0,
      ),
    [conversations],
  );

  const value = useMemo(
    () => ({
      conversations,
      loadingConversations,
      activeConversationId,
      setActiveConversationId,
      messagesByConv,
      hasMoreByConv,
      loadingMessages,
      chatUsers,
      onlineIds,
      wsConnected,
      typingByConv,
      customStickers,
      totalUnread,
      loadConversations,
      loadChatUsers,
      loadCustomStickers,
      uploadCustomSticker,
      deleteCustomSticker,
      loadMessages,
      openDirectChat,
      openProjectChat,
      createGroupChat,
      sendMessage,
      editMessage,
      deleteMessage,
      markConversationRead,
      sendTyping,
      wsRef,
      callEventHandlerRef,
    }),
    [
      conversations,
      loadingConversations,
      activeConversationId,
      setActiveConversationId,
      messagesByConv,
      hasMoreByConv,
      loadingMessages,
      chatUsers,
      onlineIds,
      wsConnected,
      typingByConv,
      customStickers,
      totalUnread,
      loadConversations,
      loadChatUsers,
      loadCustomStickers,
      uploadCustomSticker,
      deleteCustomSticker,
      loadMessages,
      openDirectChat,
      openProjectChat,
      createGroupChat,
      sendMessage,
      editMessage,
      deleteMessage,
      markConversationRead,
      sendTyping,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
