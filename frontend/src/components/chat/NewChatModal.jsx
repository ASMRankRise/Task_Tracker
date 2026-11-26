import { useMemo, useState } from "react";
import Modal from "../common/Modal";
import Alert from "../common/Alert";
import { Avatar } from "../common/Avatar";
import { RoleBadge } from "../common/Badge";
import { SearchIcon } from "../common/Icons";
import { getEntityId } from "./chatHelpers";

export function NewChatModal({
  isOpen,
  onClose,
  users = [],
  onlineIds = [],
  currentUserId,
  onStartDirect,
  onCreateGroup,
}) {
  const [mode, setMode] = useState("direct"); // "direct" | "group"
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const availableMembers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      const id = getEntityId(u);
      if (!id || id === String(currentUserId)) return false;
      if (!q) return true;
      return u.name?.toLowerCase().includes(q);
    });
  }, [users, currentUserId, search]);

  const toggleMember = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectDirect = async (targetId) => {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await onStartDirect(targetId);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Could not start direct chat.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateGroupSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");

    if (!groupName.trim() || groupName.trim().length < 2) {
      setError("Group name must be at least 2 characters.");
      return;
    }

    if (selectedIds.length === 0) {
      setError("Please select at least one team member.");
      return;
    }

    setSubmitting(true);
    try {
      await onCreateGroup({
        name: groupName.trim(),
        participantIds: selectedIds,
      });
      setGroupName("");
      setSelectedIds([]);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create group chat.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start New Conversation" size="md">
      <div className="space-y-4 text-left">
        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-surface-subtle p-1 text-[13px]">
          <button
            type="button"
            onClick={() => {
              setMode("direct");
              setError("");
            }}
            className={`rounded px-3 py-1.5 font-medium transition-colors cursor-pointer ${
              mode === "direct"
                ? "bg-surface text-text-primary shadow-subtle"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Direct Message
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("group");
              setError("");
            }}
            className={`rounded px-3 py-1.5 font-medium transition-colors cursor-pointer ${
              mode === "group"
                ? "bg-surface text-text-primary shadow-subtle"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Create Group
          </button>
        </div>

        {error && <Alert type="error" message={error} />}

        {mode === "group" && (
          <div>
            <label className="mb-1 block text-[13px] font-medium text-text-secondary">
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Frontend Sync, QA Team"
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand shadow-subtle"
            />
          </div>
        )}

        <div className="relative">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-text-tertiary" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team members..."
            className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text-primary outline-none focus:border-brand shadow-subtle"
          />
        </div>

        <div className="max-h-64 overflow-y-auto divide-y divide-border-subtle rounded-md border border-border">
          {availableMembers.length === 0 ? (
            <div className="p-6 text-center text-sm text-text-secondary">
              No team members found.
            </div>
          ) : (
            availableMembers.map((member) => {
              const id = getEntityId(member);
              const isOnline = onlineIds.includes(id);
              const isSelected = selectedIds.includes(id);

              return (
                <div
                  key={id}
                  onClick={() =>
                    mode === "direct" ? handleSelectDirect(id) : toggleMember(id)
                  }
                  className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-surface-subtle cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {mode === "group" && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="h-4 w-4 accent-brand rounded cursor-pointer"
                      />
                    )}

                    <div className="relative shrink-0">
                      <Avatar user={member} size="sm" showTooltip={false} />
                      {isOnline && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-surface" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {member.name}
                      </p>
                      <p className="text-[11px] text-text-tertiary">
                        {isOnline ? "Online now" : "Offline"}
                      </p>
                    </div>
                  </div>

                  <RoleBadge role={member.role} size="xs" />
                </div>
              );
            })
          )}
        </div>

        {mode === "group" && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-[12px] text-text-secondary">
              {selectedIds.length} {selectedIds.length === 1 ? "member" : "members"} selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-md border border-border bg-surface px-3.5 text-[13px] font-medium text-text-secondary hover:text-text-primary cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || selectedIds.length === 0 || !groupName.trim()}
                onClick={handleCreateGroupSubmit}
                className="h-9 rounded-md bg-brand hover:bg-brand-hover text-brand-text px-4 text-[13px] font-medium disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Creating..." : "Create Group"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default NewChatModal;
