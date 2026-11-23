
import { useState } from "react";
import Modal from "../common/Modal";
import Avatar from "../common/Avatar";
import Alert from "../common/Alert";
import { MailIcon } from "../common/Icons";

export function MemberManagementModal({
  isOpen,
  onClose,
  project,
  canManage = false,
  canRemoveMember = false,
  onAddMember,
  onRemoveMember,
  onAssignProjectHead,
  onRemoveProjectHead,
  addingMember,
  removingMember,
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!project) return null;

  const owner = project.owner;
  const ownerId = typeof owner === "object" ? owner?._id || owner?.id : owner;
  const headId = typeof project.projectHead === "object"
    ? project.projectHead?._id || project.projectHead?.id
    : project.projectHead;
  const members = Array.isArray(project.members) ? project.members : [];

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Please enter a valid user email.");
      return;
    }

    try {
      const res = await onAddMember?.(project._id || project.id, email.trim());
      if (res?.success !== false) {
        setSuccess(`Added ${email.trim()} to project.`);
        setEmail("");
      } else {
        setError(res?.error || "Failed to add member.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to add member.");
    }
  };

  const handleAssignHead = async (targetEmail) => {
    setError("");
    setSuccess("");
    try {
      const res = await onAssignProjectHead?.(project._id || project.id, targetEmail);
      if (res?.success !== false) {
        setSuccess("Assigned Project Head successfully.");
      } else {
        setError(res?.error || "Failed to assign Project Head.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to assign Project Head.");
    }
  };

  const handleRemoveHead = async () => {
    setError("");
    setSuccess("");
    try {
      const res = await onRemoveProjectHead?.(project._id || project.id);
      if (res?.success !== false) {
        setSuccess("Project Head removed successfully.");
      } else {
        setError(res?.error || "Failed to remove Project Head.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to remove Project Head.");
    }
  };

  const handleRemove = async (member) => {
    setError("");
    setSuccess("");
    const memberName = member?.name || member?.email || "this member";
    const memberId = typeof member === "object" ? member?._id || member?.id : member;

    if (!window.confirm(`Are you sure you want to remove ${memberName} from this project?`)) {
      return;
    }

    try {
      const res = await onRemoveMember?.(project._id || project.id, memberId);
      if (res?.success !== false) {
        setSuccess(`${memberName} removed from project.`);
      } else {
        setError(res?.error || "Failed to remove member.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to remove member.");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${project.name} • Team members`}
      subtitle="Assign members to this project and manage collaboration access."
      size="md"
    >
      <div className="space-y-4 text-text-primary text-left">
        {error && <Alert message={error} type="error" />}
        {success && <Alert message={success} type="success" />}

        {canManage && (
          <form
            onSubmit={handleAdd}
            className="rounded-lg border border-border bg-surface-subtle p-3.5 shadow-subtle"
          >
            <label
              htmlFor="memberEmail"
              className="mb-1.5 block text-[13px] font-medium text-text-secondary"
            >
              Add member by email
            </label>
            <div className="flex gap-2.5">
              <div className="relative flex-1">
                <MailIcon className="absolute left-3 top-2.5 h-4 w-4 text-text-tertiary" />
                <input
                  id="memberEmail"
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-surface py-1 pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand focus:ring-1 focus:ring-brand transition-colors shadow-subtle"
                />
              </div>
              <button
                type="submit"
                disabled={addingMember || !email.trim()}
                className="h-9 inline-flex items-center gap-1.5 rounded-md bg-brand hover:bg-brand-hover px-4 text-[13px] font-medium text-brand-text shadow-subtle disabled:opacity-50 transition-colors cursor-pointer"
              >
                {addingMember ? "Adding..." : "+ Add"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12px] font-semibold text-text-secondary">
            <span>
              Project members (
              {
                new Set([
                  ...(ownerId ? [String(ownerId)] : []),
                  ...members.map((m) =>
                    String(typeof m === "object" ? m?._id || m?.id : m),
                  ),
                ]).size
              }
              )
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-border-subtle rounded-lg border border-border bg-surface shadow-subtle">
            {owner && (
              <div className="flex items-center justify-between p-3 bg-surface-subtle/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar user={owner} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {owner?.name || owner?.email || "Project lead"}
                    </p>
                    <p className="truncate text-[12px] text-text-tertiary">
                      {owner?.email}
                    </p>
                  </div>
                </div>

                <span className="shrink-0 rounded-md border border-border bg-surface px-2 py-0.5 text-[12px] font-medium text-text-secondary">
                  Lead
                </span>
              </div>
            )}

            {members.map((member) => {
              const mId = typeof member === "object" ? member?._id || member?.id : member;
              const isOwner = String(mId) === String(ownerId);
              if (isOwner) return null;
              const isHead = headId && String(mId) === String(headId);

              return (
                <div
                  key={mId}
                  className="flex items-center justify-between p-3 hover:bg-surface-subtle/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar user={member} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {member?.name || member?.email || "Team member"}
                      </p>
                      <p className="truncate text-[12px] text-text-tertiary">
                        {member?.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {isHead ? (
                      <span className="shrink-0 rounded-md border border-brand/30 bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-brand">
                        Project Head
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-text-secondary">
                        Member
                      </span>
                    )}

                    {canManage && (
                      <>
                        {isHead ? (
                          <button
                            type="button"
                            onClick={handleRemoveHead}
                            className="text-[12px] font-medium text-text-secondary hover:underline p-1 cursor-pointer"
                            title="Remove as Project Head"
                          >
                            Remove Head
                          </button>
                        ) : !headId ? (
                          <button
                            type="button"
                            onClick={() => handleAssignHead(member.email)}
                            className="text-[12px] font-medium text-brand hover:underline p-1 cursor-pointer"
                            title="Assign as Project Head"
                          >
                            Make Head
                          </button>
                        ) : null}
                      </>
                    )}

                    {canRemoveMember && (
                      <button
                        type="button"
                        disabled={removingMember}
                        onClick={() => handleRemove(member)}
                        className="text-[13px] font-medium text-[#991B1B] dark:text-[#F87171] hover:underline p-1 transition-colors cursor-pointer"
                        title="Remove member from project"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {members.length === 0 && !owner && (
              <div className="p-6 text-center text-sm text-text-secondary">
                No members have been assigned to this project yet.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-border bg-surface px-4 text-[13px] font-medium text-text-primary hover:bg-surface-subtle transition-colors shadow-subtle cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default MemberManagementModal;
