import { useMemo, useState } from "react";
import { Avatar } from "../common/Avatar";
import { HashIcon, PlusIcon, SearchIcon, StickerIcon, UsersIcon } from "../common/Icons";
import { formatRelativeTime, getConversationDisplay } from "./chatHelpers";

export function ConversationList({
  conversations = [],
  activeConversationId,
  onSelectConversation,
  onOpenNewChat,
  currentUserId,
  onlineIds = [],
  wsConnected = false,
  loading = false,
}) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all"); // "all" | "direct" | "project"

  const filteredConversations = useMemo(() => {
    const q = search.toLowerCase().trim();
    return conversations.filter((conv) => {
      if (tab === "direct" && conv.type === "project") return false;
      if (tab === "project" && conv.type !== "project") return false;
      if (!q) return true;
      const { title } = getConversationDisplay(conv, currentUserId, onlineIds);
      return (
        title.toLowerCase().includes(q) ||
        (conv.lastMessagePreview || "").toLowerCase().includes(q)
      );
    });
  }, [conversations, tab, search, currentUserId, onlineIds]);

  return (
    <div className="flex h-full flex-col border-r border-border bg-surface text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-bold tracking-tight text-text-primary font-heading">
            Messages
          </h2>
          <span
            title={wsConnected ? "Live WebSocket connected" : "Connecting live socket..."}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
              wsConnected
                ? "bg-done-bg text-done border-done-border"
                : "bg-surface-subtle text-text-tertiary border-border"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                wsConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <span>{wsConnected ? "Live" : "Syncing"}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenNewChat}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand hover:bg-brand-hover text-brand-text px-2.5 text-[12px] font-medium shadow-subtle transition-colors cursor-pointer shrink-0"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span>New chat</span>
        </button>
      </div>

      {/* Search & Filter Tabs */}
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-2.5 h-3.5 w-3.5 text-text-tertiary" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people or channels..."
            className="h-8 w-full rounded-md border border-border bg-surface-subtle/60 pl-8 pr-3 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand focus:bg-surface transition-colors"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-surface-subtle p-0.5 text-[12px]">
          {[
            { id: "all", label: "All" },
            { id: "direct", label: "Direct / Group" },
            { id: "project", label: "Projects" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded px-2 py-1 font-medium transition-colors cursor-pointer truncate ${
                tab === item.id
                  ? "bg-surface text-text-primary shadow-subtle"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
        {loading && conversations.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-text-secondary">
            Loading conversations...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-[13px] text-text-secondary">
              {search
                ? "No matching conversations."
                : "No chats yet. Start a direct conversation or pick a project channel."}
            </p>
            {!search && (
              <button
                type="button"
                onClick={onOpenNewChat}
                className="text-[13px] font-medium text-brand hover:underline cursor-pointer"
              >
                Start a conversation
              </button>
            )}
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = conv._id === activeConversationId;
            const unread = Number(conv.unreadCount || 0);
            const { title, avatarUser, isOnline } = getConversationDisplay(
              conv,
              currentUserId,
              onlineIds,
            );

            return (
              <button
                key={conv._id}
                type="button"
                onClick={() => onSelectConversation(conv._id)}
                className={`w-full flex items-start gap-3 px-3.5 py-3 text-left transition-colors cursor-pointer ${
                  isActive
                    ? "bg-brand/10 border-l-2 border-l-brand"
                    : "hover:bg-surface-subtle/60"
                }`}
              >
                <div className="relative shrink-0 mt-0.5">
                  {conv.type === "project" ? (
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-subtle text-brand">
                      <HashIcon className="h-4 w-4" />
                    </div>
                  ) : conv.type === "group" ? (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-subtle text-text-secondary">
                      <UsersIcon className="h-4 w-4" />
                    </div>
                  ) : (
                    <Avatar user={avatarUser || { name: title }} size="md" showTooltip={false} />
                  )}

                  {conv.type === "direct" && isOnline && (
                    <span
                      title="Online"
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-surface"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-[13px] ${
                        unread > 0 || isActive
                          ? "font-semibold text-text-primary"
                          : "font-medium text-text-primary"
                      }`}
                    >
                      {title}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-tertiary">
                      {formatRelativeTime(conv.lastMessageAt || conv.createdAt)}
                    </span>
                  </div>

                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p
                      className={`truncate text-[12px] ${
                        unread > 0
                          ? "font-medium text-text-primary"
                          : "text-text-secondary"
                      }`}
                    >
                      {conv.lastMessagePreview === "Sticker" ? (
                        <span className="inline-flex items-center gap-1 align-middle">
                          <StickerIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                          <span>Sticker</span>
                        </span>
                      ) : (
                        conv.lastMessagePreview ||
                        (conv.type === "project"
                          ? "Project channel"
                          : "No messages yet")
                      )}
                    </p>

                    {unread > 0 && (
                      <span className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-text shrink-0">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ConversationList;
