import { useEffect, useRef, useState } from "react";
import { Avatar } from "../common/Avatar";
import { PriorityBadge, StatusBadge } from "../common/Badge";
import {
  ArrowLeftIcon,
  EditIcon,
  HashIcon,
  LinkIcon,
  PhoneIcon,
  ReplyIcon,
  TrashIcon,
  UsersIcon,
  VideoIcon,
} from "../common/Icons";
import {
  formatDateDivider,
  formatMessageTime,
  getConversationDisplay,
  getDateKey,
  getEntityId,
} from "./chatHelpers";
import { getStickerMeta, getStickerUrl } from "./stickerCatalog";

function StickerImage({ src, alt, className }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-border bg-surface/60 px-2 text-center text-[11px] text-text-tertiary">
        Sticker unavailable
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || "Sticker"}
      title={alt || "Sticker"}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function MessageThread({
  conversation,
  messages = [],
  hasMore = false,
  loading = false,
  currentUser,
  onlineIds = [],
  typingUsers = [],
  customStickers = [],
  onLoadOlder,
  onReply,
  onEditMessage,
  onDeleteMessage,
  onOpenTask,
  onBackMobile,
  onStartCall,
  onStartVideoCall,
  onJoinHuddle,
  onJoinVideoHuddle,
  activeHuddleParticipants = [],
  inThisHuddle = false,
  callBusy = false,
}) {
  const currentUserId = getEntityId(currentUser);
  const isSuperAdmin = currentUser?.role === "superadmin";

  const scrollContainerRef = useRef(null);
  const bottomRef = useRef(null);
  const prevConvIdRef = useRef(null);
  const prevLastMsgIdRef = useRef(null);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const { title, subtitle, avatarUser, isOnline } = getConversationDisplay(
    conversation,
    currentUserId,
    onlineIds,
  );

  // Auto-scroll on initial conversation open or when a new message lands near bottom
  useEffect(() => {
    const convId = conversation?._id || null;
    const lastMsg = messages[messages.length - 1];
    const lastMsgId = lastMsg?._id || null;

    if (convId !== prevConvIdRef.current) {
      prevConvIdRef.current = convId;
      prevLastMsgIdRef.current = lastMsgId;
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      return;
    }

    if (lastMsgId && lastMsgId !== prevLastMsgIdRef.current) {
      prevLastMsgIdRef.current = lastMsgId;
      const el = scrollContainerRef.current;
      const isMine = getEntityId(lastMsg.sender) === currentUserId;
      const nearBottom =
        !el || el.scrollHeight - el.scrollTop - el.clientHeight < 180;

      if (isMine || nearBottom) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [conversation?._id, messages, currentUserId]);

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingMessageId || !editText.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await onEditMessage(editingMessageId, editText.trim());
      setEditingMessageId(null);
      setEditText("");
    } finally {
      setSavingEdit(false);
    }
  };

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-canvas/40">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-brand shadow-subtle">
          <UsersIcon className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-base font-semibold text-text-primary">
          Select a conversation
        </h3>
        <p className="mt-1 max-w-sm text-sm text-text-secondary">
          Pick a teammate or project channel on the left, or start a new chat to message your team in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas/30 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 text-left">
        <div className="flex items-center gap-3 min-w-0">
          {onBackMobile && (
            <button
              type="button"
              onClick={onBackMobile}
              className="rounded-md p-1.5 text-text-secondary hover:bg-surface-subtle hover:text-text-primary lg:hidden cursor-pointer"
              aria-label="Back to conversations"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
          )}

          <div className="relative shrink-0">
            {conversation.type === "project" ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-subtle text-brand">
                <HashIcon className="h-4 w-4" />
              </div>
            ) : conversation.type === "group" ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-subtle text-text-secondary">
                <UsersIcon className="h-4 w-4" />
              </div>
            ) : (
              <Avatar user={avatarUser || { name: title }} size="md" showTooltip={false} />
            )}

            {conversation.type === "direct" && isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-surface" />
            )}
          </div>

          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {title}
            </h3>
            <p className="truncate text-[12px] text-text-secondary">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Participant pill + Call / Huddle buttons */}
        <div className="flex items-center gap-2">
          {conversation.type === "direct" && onStartCall && (
            <>
              <button
                type="button"
                onClick={onStartCall}
                disabled={callBusy}
                className="flex items-center gap-1.5 rounded-md border border-border bg-surface-subtle px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={callBusy ? "Call in progress" : "Voice call"}
              >
                <PhoneIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Call</span>
              </button>

              {onStartVideoCall && (
                <button
                  type="button"
                  onClick={onStartVideoCall}
                  disabled={callBusy}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-surface-subtle px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-brand/10 hover:text-brand hover:border-brand/40 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title={callBusy ? "Call in progress" : "Video call"}
                >
                  <VideoIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Video</span>
                </button>
              )}
            </>
          )}

          {(conversation.type === "group" || conversation.type === "project") &&
            onJoinHuddle && (
              <>
                <button
                  type="button"
                  onClick={onJoinHuddle}
                  disabled={callBusy || inThisHuddle}
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    activeHuddleParticipants.length > 0
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "border-border bg-surface-subtle text-text-secondary hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400"
                  }`}
                  title={
                    inThisHuddle
                      ? "Currently in this huddle"
                      : activeHuddleParticipants.length > 0
                        ? "Join active group huddle"
                        : "Start group voice huddle (up to 5)"
                  }
                >
                  <PhoneIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {inThisHuddle
                      ? "In Huddle"
                      : activeHuddleParticipants.length > 0
                        ? `Join (${activeHuddleParticipants.length})`
                        : "Huddle"}
                  </span>
                </button>

                {onJoinVideoHuddle && !inThisHuddle && (
                  <button
                    type="button"
                    onClick={onJoinVideoHuddle}
                    disabled={callBusy}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-surface-subtle px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-brand/10 hover:text-brand hover:border-brand/40 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      activeHuddleParticipants.length > 0
                        ? "Join huddle with video"
                        : "Start group video call (up to 5)"
                    }
                  >
                    <VideoIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Video</span>
                  </button>
                )}
              </>
            )}

          {Array.isArray(conversation.participants) &&
            conversation.participants.length > 0 && (
            <div
              className="hidden sm:flex items-center gap-1.5 rounded-md border border-border bg-surface-subtle px-2.5 py-1 text-[12px] text-text-secondary max-w-[240px]"
              title={conversation.participants.map((p) => p.name).join(", ")}
            >
              <UsersIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              <span className="truncate">
                {conversation.type === "direct"
                  ? "Direct Message"
                  : conversation.participants.map((p) => p.name?.split(" ")[0]).join(", ")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Live Huddle Banner for Group/Project chats */}
      {(conversation.type === "group" || conversation.type === "project") &&
        activeHuddleParticipants.length > 0 &&
        !inThisHuddle &&
        onJoinHuddle && (
          <div className="flex items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50/90 px-4 py-2 text-left dark:border-emerald-900/50 dark:bg-emerald-950/40">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <p className="truncate text-[12px] font-medium text-emerald-800 dark:text-emerald-300">
                Huddle active ({activeHuddleParticipants.length}/5):{" "}
                {activeHuddleParticipants.map((p) => p.userName?.split(" ")[0]).join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onJoinHuddle}
                disabled={callBusy}
                className="rounded-md bg-emerald-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                Join Audio
              </button>
              {onJoinVideoHuddle && (
                <button
                  type="button"
                  onClick={onJoinVideoHuddle}
                  disabled={callBusy}
                  className="rounded-md border border-emerald-600/30 bg-surface px-2.5 py-1 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 disabled:opacity-50 cursor-pointer"
                >
                  Join Video
                </button>
              )}
            </div>
          </div>
        )}

      {/* Scrollable Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
      >
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={loading}
              className="rounded-md border border-border bg-surface px-3 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-subtle hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? "Loading..." : "Load older messages"}
            </button>
          </div>
        )}

        {loading && messages.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-secondary">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-secondary">
            No messages here yet. Say hello to start the conversation!
          </div>
        ) : (
          messages.map((msg, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const dateChanged =
              !prev || getDateKey(prev.createdAt) !== getDateKey(msg.createdAt);

            const senderId = getEntityId(msg.sender);
            const isMine = senderId === currentUserId;
            const canDelete = isMine || isSuperAdmin;
            const isGrouped =
              !dateChanged &&
              prev &&
              getEntityId(prev.sender) === senderId &&
              new Date(msg.createdAt).getTime() -
                new Date(prev.createdAt).getTime() <
                5 * 60 * 1000;

            const isEditing = editingMessageId === msg._id;
            const isSticker =
              !msg.deleted &&
              msg.messageType === "sticker" &&
              Boolean(msg.stickerId);
            const stickerMeta = isSticker
              ? getStickerMeta(msg.stickerId, customStickers)
              : null;
            const stickerUrl = isSticker ? getStickerUrl(msg.stickerId) : null;
            const replyStickerUrl =
              !msg.deleted &&
              msg.replyTo &&
              !msg.replyTo.deleted &&
              msg.replyTo.messageType === "sticker" &&
              msg.replyTo.stickerId
                ? getStickerUrl(msg.replyTo.stickerId)
                : null;

            return (
              <div key={msg._id}>
                {dateChanged && (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-text-tertiary">
                      {formatDateDivider(msg.createdAt)}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}

                <div
                  className={`group flex gap-2.5 ${
                    isMine ? "flex-row-reverse" : "flex-row"
                  } ${isGrouped ? "mt-0.5" : "mt-3"}`}
                >
                  {/* Avatar column */}
                  <div className="w-7 shrink-0 flex justify-center">
                    {!isGrouped && !isMine && (
                      <Avatar user={msg.sender} size="xs" showTooltip={false} />
                    )}
                  </div>

                  {/* Message bubble */}
                  <div
                    className={`flex max-w-[78%] sm:max-w-[70%] flex-col ${
                      isMine ? "items-end" : "items-start"
                    }`}
                  >
                    {!isGrouped && !isMine && (
                      <span className="mb-1 text-[11px] font-semibold text-text-secondary px-1">
                        {msg.sender?.name || "Team Member"}
                      </span>
                    )}

                    <div className="flex items-end gap-1.5">
                      {/* Hover Actions on left for own messages */}
                      {isMine && !msg.deleted && !isEditing && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => onReply(msg)}
                            className="rounded p-1 text-text-tertiary hover:bg-surface hover:text-text-primary cursor-pointer"
                            title="Reply"
                          >
                            <ReplyIcon className="h-3.5 w-3.5" />
                          </button>
                          {!isSticker && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessageId(msg._id);
                                setEditText(msg.content);
                              }}
                              className="rounded p-1 text-text-tertiary hover:bg-surface hover:text-text-primary cursor-pointer"
                              title="Edit"
                            >
                              <EditIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteMessage(msg._id)}
                            className="rounded p-1 text-text-tertiary hover:bg-surface hover:text-accent cursor-pointer"
                            title="Delete"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      {isSticker ? (
                        /* Frameless WhatsApp-style Sticker Message */
                        <div
                          className={`flex flex-col ${
                            isMine ? "items-end" : "items-start"
                          }`}
                        >
                          {msg.replyTo && (
                            <div
                              className={`mb-1 max-w-[220px] rounded-md border border-border border-l-2 border-l-brand bg-surface px-2.5 py-1 text-left text-[12px] text-text-secondary shadow-subtle`}
                            >
                              <span className="font-semibold text-text-primary block truncate">
                                {msg.replyTo.sender?.name || "Team Member"}
                              </span>
                              {replyStickerUrl ? (
                                <span className="inline-flex items-center gap-1">
                                  <img
                                    src={replyStickerUrl}
                                    alt="Sticker"
                                    className="h-4 w-4 object-contain shrink-0"
                                    draggable={false}
                                  />
                                  <span>Sticker</span>
                                </span>
                              ) : (
                                <span className="line-clamp-1">
                                  {msg.replyTo.content}
                                </span>
                              )}
                            </div>
                          )}

                          <StickerImage
                            src={stickerUrl}
                            alt={stickerMeta?.label || "Sticker"}
                            className="h-32 w-32 sm:h-36 sm:w-36 object-contain select-none transition-transform duration-150 hover:scale-105"
                          />

                          <span className="mt-0.5 rounded-full border border-border/70 bg-surface/90 px-2 py-0.5 text-[10px] text-text-tertiary shadow-subtle">
                            {formatMessageTime(msg.createdAt)}
                          </span>
                        </div>
                      ) : (
                        <div
                          className={`rounded-lg px-3 py-2 text-left text-sm shadow-subtle border ${
                            msg.deleted
                              ? "bg-surface/60 border-border text-text-tertiary italic"
                              : isMine
                                ? "bg-brand text-brand-text border-brand"
                                : "bg-surface text-text-primary border-border"
                          }`}
                        >
                          {/* Reply reference */}
                          {!msg.deleted && msg.replyTo && (
                            <div
                              className={`mb-1.5 rounded border-l-2 px-2 py-1 text-[12px] ${
                                isMine
                                  ? "border-white/60 bg-black/15 text-brand-text/90"
                                  : "border-brand bg-surface-subtle text-text-secondary"
                              }`}
                            >
                              <span className="font-semibold block">
                                {msg.replyTo.sender?.name || "Team Member"}
                              </span>
                              {replyStickerUrl ? (
                                <span className="inline-flex items-center gap-1">
                                  <img
                                    src={replyStickerUrl}
                                    alt="Sticker"
                                    className="h-4 w-4 object-contain shrink-0"
                                    draggable={false}
                                  />
                                  <span>Sticker</span>
                                </span>
                              ) : (
                                <span className="line-clamp-1">
                                  {msg.replyTo.content}
                                </span>
                              )}
                            </div>
                          )}

                          {isEditing ? (
                            <form onSubmit={handleSaveEdit} className="space-y-2 min-w-[220px]">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                rows={2}
                                maxLength={4000}
                                className="w-full rounded border border-border bg-surface p-2 text-sm text-text-primary outline-none focus:border-brand"
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMessageId(null);
                                    setEditText("");
                                  }}
                                  className="rounded bg-surface px-2 py-0.5 text-[12px] font-medium text-text-secondary hover:text-text-primary cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={savingEdit || !editText.trim()}
                                  className="rounded bg-emerald-600 px-2.5 py-0.5 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                                >
                                  {savingEdit ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {msg.deleted ? "This message was deleted" : msg.content}
                            </p>
                          )}

                          {/* Linked Task preview card */}
                          {!msg.deleted && msg.task && (
                            <div
                              onClick={() => onOpenTask?.(msg.task)}
                              className={`mt-2 rounded-md border p-2 transition-colors ${
                                onOpenTask ? "cursor-pointer" : ""
                              } ${
                                isMine
                                  ? "border-white/25 bg-black/15 hover:bg-black/25 text-brand-text"
                                  : "border-border bg-surface-subtle hover:bg-surface text-text-primary"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 text-[11px] opacity-80">
                                <LinkIcon className="h-3 w-3 shrink-0" />
                                <span>Linked Task</span>
                              </div>
                              <p className="mt-0.5 text-[13px] font-semibold truncate">
                                {msg.task.title}
                              </p>
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                <StatusBadge status={msg.task.status} size="xs" />
                                <PriorityBadge priority={msg.task.priority} size="xs" />
                              </div>
                            </div>
                          )}

                          {/* Timestamp + Edited label */}
                          <div
                            className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${
                              msg.deleted
                                ? "text-text-tertiary"
                                : isMine
                                  ? "text-brand-text/75"
                                  : "text-text-tertiary"
                            }`}
                          >
                            {msg.editedAt && !msg.deleted && <span>(edited)</span>}
                            <span>{formatMessageTime(msg.createdAt)}</span>
                          </div>
                        </div>
                      )}

                      {/* Hover Actions on right for received messages */}
                      {!isMine && !msg.deleted && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => onReply(msg)}
                            className="rounded p-1 text-text-tertiary hover:bg-surface hover:text-text-primary cursor-pointer"
                            title="Reply"
                          >
                            <ReplyIcon className="h-3.5 w-3.5" />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => onDeleteMessage(msg._id)}
                              className="rounded p-1 text-text-tertiary hover:bg-surface hover:text-accent cursor-pointer"
                              title="Delete"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 pt-2 pl-9 text-[12px] text-text-secondary italic">
            <span className="inline-flex gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-bounce" />
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-bounce [animation-delay:0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-bounce [animation-delay:0.3s]" />
            </span>
            <span>
              {typingUsers.map((u) => u.userName).join(", ")}{" "}
              {typingUsers.length === 1 ? "is" : "are"} typing...
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default MessageThread;
