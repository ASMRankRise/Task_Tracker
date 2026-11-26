export function getEntityId(entity) {
  if (!entity) return "";
  if (typeof entity === "object") {
    return String(entity._id || entity.id || entity.userId || "").trim();
  }
  return String(entity).trim();
}

export function getConversationDisplay(conv, currentUserId, onlineIds = []) {
  if (!conv) {
    return {
      title: "Conversation",
      subtitle: "",
      avatarUser: null,
      otherParticipant: null,
      isOnline: false,
    };
  }

  const participants = Array.isArray(conv.participants) ? conv.participants : [];

  if (conv.type === "project") {
    return {
      title: conv.project?.name || conv.name || "Project Channel",
      subtitle: `${participants.length} ${participants.length === 1 ? "member" : "members"}`,
      avatarUser: null,
      otherParticipant: null,
      isOnline: false,
    };
  }

  if (conv.type === "group") {
    const onlineCount = participants.filter(
      (p) => getEntityId(p) !== currentUserId && onlineIds.includes(getEntityId(p)),
    ).length;
    return {
      title: conv.name || "Group Chat",
      subtitle: `${participants.length} members${onlineCount > 0 ? ` · ${onlineCount} online` : ""}`,
      avatarUser: null,
      otherParticipant: null,
      isOnline: onlineCount > 0,
    };
  }

  // Direct message: show the other participant
  const other =
    participants.find((p) => getEntityId(p) !== String(currentUserId)) ||
    participants[0] ||
    null;
  const otherId = getEntityId(other);
  const isOnline = Boolean(otherId && onlineIds.includes(otherId));

  return {
    title: other?.name || "Direct Message",
    subtitle: isOnline ? "Online" : other?.role === "superadmin" ? "Super Admin" : other?.role === "admin" ? "Administrator" : "Team Member",
    avatarUser: other,
    otherParticipant: other,
    isOnline,
  };
}

export function formatRelativeTime(dateInput) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m`;

  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return "Yesterday";
  }

  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatMessageTime(dateInput) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getDateKey(dateInput) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDateDivider(dateInput) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();
  if (getDateKey(d) === getDateKey(now)) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (getDateKey(d) === getDateKey(yesterday)) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
