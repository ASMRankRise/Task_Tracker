import { useMemo, useRef, useState } from "react";
import {
  LinkIcon,
  ReplyIcon,
  SendIcon,
  StickerIcon,
  XIcon,
} from "../common/Icons";
import StickerPicker from "./StickerPicker";
import { getStickerUrl, recordRecentSticker } from "./stickerCatalog";

export function MessageComposer({
  disabled = false,
  replyTo = null,
  onCancelReply,
  tasks = [],
  customStickers = [],
  currentUser = null,
  onUploadSticker,
  onDeleteSticker,
  onSendMessage,
  onTyping,
}) {
  const [content, setContent] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [taskQuery, setTaskQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const textareaRef = useRef(null);

  const filteredTasks = useMemo(() => {
    const q = taskQuery.toLowerCase().trim();
    const list = Array.isArray(tasks) ? tasks : [];
    return (q
      ? list.filter(
          (t) =>
            t.title?.toLowerCase().includes(q) ||
            t.project?.name?.toLowerCase().includes(q),
        )
      : list
    ).slice(0, 12);
  }, [tasks, taskQuery]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setContent(val);
    if (error) setError("");
    if (val.trim()) {
      onTyping?.(true);
    } else {
      onTyping?.(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (disabled || sending) return;

    const trimmed = content.trim();
    if (!trimmed) return;
    if (trimmed.length > 4000) {
      setError("Message cannot exceed 4000 characters.");
      return;
    }

    setSending(true);
    setError("");
    try {
      await onSendMessage({
        content: trimmed,
        taskId: selectedTask?._id || selectedTask?.id || null,
        replyToId: replyTo?._id || null,
      });
      setContent("");
      setSelectedTask(null);
      onCancelReply?.();
      onTyping?.(false);
      textareaRef.current?.focus();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleSendSticker = async (sticker) => {
    if (disabled || sending || !sticker?.id) return;
    setSending(true);
    setError("");
    setStickerPickerOpen(false);
    try {
      recordRecentSticker(sticker.id);
      await onSendMessage({
        messageType: "sticker",
        stickerId: sticker.id,
        replyToId: replyTo?._id || null,
      });
      onCancelReply?.();
      onTyping?.(false);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send sticker.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const replyStickerUrl =
    replyTo?.messageType === "sticker" && replyTo?.stickerId
      ? getStickerUrl(replyTo.stickerId)
      : null;

  return (
    <div className="relative border-t border-border bg-surface p-3 text-left">
      {/* Sticker Picker Popover */}
      {stickerPickerOpen && (
        <StickerPicker
          disabled={disabled || sending}
          customStickers={customStickers}
          currentUser={currentUser}
          onUploadSticker={onUploadSticker}
          onDeleteSticker={onDeleteSticker}
          onSelectSticker={handleSendSticker}
          onClose={() => setStickerPickerOpen(false)}
        />
      )}

      {/* Task Picker Popover */}
      {taskPickerOpen && (
        <div className="absolute bottom-full left-3 right-3 sm:right-auto sm:w-80 mb-2 rounded-lg border border-border bg-surface shadow-lg z-20 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-surface-subtle">
            <span className="text-[12px] font-semibold text-text-primary">
              Reference a Task
            </span>
            <button
              type="button"
              onClick={() => setTaskPickerOpen(false)}
              className="rounded p-0.5 text-text-tertiary hover:text-text-primary cursor-pointer"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-2 border-b border-border">
            <input
              type="search"
              value={taskQuery}
              onChange={(e) => setTaskQuery(e.target.value)}
              placeholder="Search tasks by title..."
              className="h-8 w-full rounded border border-border bg-surface px-2.5 text-[12px] text-text-primary outline-none focus:border-brand"
            />
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-border-subtle">
            {filteredTasks.length === 0 ? (
              <div className="p-3 text-center text-[12px] text-text-tertiary">
                No matching tasks found.
              </div>
            ) : (
              filteredTasks.map((t) => (
                <button
                  key={t._id || t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTask(t);
                    setTaskPickerOpen(false);
                    setTaskQuery("");
                    textareaRef.current?.focus();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-surface-subtle transition-colors cursor-pointer"
                >
                  <p className="text-[12px] font-medium text-text-primary truncate">
                    {t.title}
                  </p>
                  <p className="text-[11px] text-text-tertiary truncate">
                    {t.project?.name || "Workspace"} · {t.status}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Reply Banner */}
      {replyTo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md border-l-2 border-brand bg-surface-subtle px-2.5 py-1.5 text-[12px]">
          <div className="min-w-0 flex items-center gap-1.5">
            <ReplyIcon className="h-3.5 w-3.5 text-brand shrink-0" />
            <span className="font-semibold text-text-primary shrink-0">
              {replyTo.sender?.name || "Team Member"}:
            </span>
            {replyStickerUrl ? (
              <span className="inline-flex items-center gap-1 text-text-secondary">
                <img
                  src={replyStickerUrl}
                  alt="Sticker"
                  className="h-5 w-5 object-contain shrink-0"
                  draggable={false}
                />
                <span>Sticker</span>
              </span>
            ) : (
              <span className="truncate text-text-secondary">
                {replyTo.messageType === "sticker" ? "Sticker" : replyTo.content}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="rounded p-0.5 text-text-tertiary hover:text-text-primary cursor-pointer"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Attached Task Chip */}
      {selectedTask && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-border bg-surface-subtle px-2.5 py-1.5 text-[12px]">
          <div className="min-w-0 flex items-center gap-1.5">
            <LinkIcon className="h-3.5 w-3.5 text-brand shrink-0" />
            <span className="font-medium text-text-primary truncate">
              Task: {selectedTask.title}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedTask(null)}
            className="rounded p-0.5 text-text-tertiary hover:text-text-primary cursor-pointer"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <p className="mb-1.5 text-[12px] font-medium text-accent">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <button
          type="button"
          data-sticker-toggle="true"
          disabled={disabled || sending}
          onClick={() => {
            setStickerPickerOpen((prev) => !prev);
            setTaskPickerOpen(false);
          }}
          title="Send a sticker"
          aria-label="Send a sticker"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border transition-colors cursor-pointer disabled:opacity-50 ${
            stickerPickerOpen
              ? "bg-brand/10 text-brand border-brand/30"
              : "bg-surface-subtle text-text-secondary hover:text-text-primary"
          }`}
        >
          <StickerIcon className="h-4 w-4" />
        </button>

        <button
          type="button"
          disabled={disabled || sending}
          onClick={() => {
            setTaskPickerOpen((prev) => !prev);
            setStickerPickerOpen(false);
          }}
          title="Reference a task"
          aria-label="Reference a task"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border transition-colors cursor-pointer disabled:opacity-50 ${
            selectedTask || taskPickerOpen
              ? "bg-brand/10 text-brand border-brand/30"
              : "bg-surface-subtle text-text-secondary hover:text-text-primary"
          }`}
        >
          <LinkIcon className="h-4 w-4" />
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          maxLength={4000}
          disabled={disabled || sending}
          value={content}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={() => onTyping?.(false)}
          placeholder="Write a message... (Enter to send, Shift+Enter for new line)"
          className="max-h-32 min-h-[36px] flex-1 resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand transition-colors"
        />

        <button
          type="submit"
          disabled={disabled || sending || !content.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand hover:bg-brand-hover text-brand-text px-3.5 text-[13px] font-medium shadow-subtle transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          <SendIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{sending ? "Sending" : "Send"}</span>
        </button>
      </form>

      {content.length > 3500 && (
        <div className="mt-1 text-right text-[11px] text-text-tertiary">
          {content.length} / 4000
        </div>
      )}
    </div>
  );
}

export default MessageComposer;
