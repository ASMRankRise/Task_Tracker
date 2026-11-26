const WORKSPACE_HUB_NAME = "workspace-main";
const RPC_TIMEOUT_MS = 2500;

let hubNamespace = null;

/**
 * Registers the Cloudflare Durable Object namespace binding.
 * Safe no-op in Node.js unit tests where Durable Objects are absent.
 */
const setChatHub = (namespace) => {
  hubNamespace = namespace || null;
};

const getHubStub = () => {
  if (!hubNamespace || typeof hubNamespace.idFromName !== "function") {
    return null;
  }
  return hubNamespace.get(hubNamespace.idFromName(WORKSPACE_HUB_NAME));
};

const fetchWithTimeout = async (stub, url, init) => {
  let timerId;
  try {
    return await Promise.race([
      stub.fetch(url, init),
      new Promise((_, reject) => {
        timerId = setTimeout(
          () => reject(new Error("ChatHub RPC timed out")),
          RPC_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timerId);
  }
};

/**
 * Pushes a real-time chat event to all active WebSockets belonging to recipientIds.
 */
const broadcastToUsers = async (recipientIds = [], event) => {
  const stub = getHubStub();
  if (!stub || !event || !Array.isArray(recipientIds) || recipientIds.length === 0) {
    return { delivered: 0 };
  }

  try {
    const res = await fetchWithTimeout(stub, "https://chat-hub/internal/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipientIds: [...new Set(recipientIds.filter(Boolean).map(String))],
        event,
      }),
    });
    if (!res.ok) return { delivered: 0 };
    return await res.json();
  } catch (err) {
    console.warn("[ChatHub] Broadcast error:", err?.message || err);
    return { delivered: 0 };
  }
};

/**
 * Queries currently connected user IDs from the workspace Durable Object.
 */
const getOnlineUserIds = async () => {
  const stub = getHubStub();
  if (!stub) return [];

  try {
    const res = await fetchWithTimeout(stub, "https://chat-hub/internal/online", {
      method: "GET",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.onlineIds) ? data.onlineIds : [];
  } catch (err) {
    console.warn("[ChatHub] Online users lookup failed:", err?.message || err);
    return [];
  }
};

module.exports = {
  setChatHub,
  broadcastToUsers,
  getOnlineUserIds,
};
