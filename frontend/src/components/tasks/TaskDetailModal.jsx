import { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { AvatarGroup } from "../common/Avatar";
import {
  CalendarIcon,
  TrashIcon,
  ClockIcon,
  FolderIcon,
  AlertTriangleIcon,
} from "../common/Icons";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { getEntityId, getTaskPermissions } from "../../utils/taskPermissions";
import TaskStatusDropdown from "./TaskStatusDropdown";
import TaskPriorityDropdown from "./TaskPriorityDropdown";
import TaskActivityHistory from "./TaskActivityHistory";

export function TaskDetailModal({
  isOpen,
  onClose,
  task,
  projects = [],
  currentUser,
  user,
  onUpdateTask,
  onUpdate,
  onDeleteTask,
  onDelete,
}) {
  const { success, error: toastError } = useToast();
  const { user: authUser } = useAuth();
  const effectiveUser = currentUser || user || authUser;
  const updateHandler = onUpdateTask || onUpdate;
  const deleteHandler = onDeleteTask || onDelete;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const triggerHistoryRefresh = () => setHistoryRefreshKey((prev) => prev + 1);

  useEffect(() => {
    if (task) {
      setTitle(task.title || "");
      setDescription(task.description || "");
      setStatus(task.status || "todo");
      setPriority(task.priority || "medium");
      setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "");
      setIsEditing(false);
    }
  }, [task]);

  if (!task) return null;

  const assignedUsers = Array.isArray(task.assignedTo)
    ? task.assignedTo
    : task.assignedTo
    ? [task.assignedTo]
    : [];

  const projectId = getEntityId(task.project);
  const project = projects.find((p) => String(getEntityId(p)) === String(projectId));

  const {
    canView,
    canChangeStatus,
    canChangePriority,
    canEditDetails,
    canDeleteTask,
  } = getTaskPermissions(task, project, effectiveUser);

  const canManageFull = canEditDetails;
  const canEdit = canEditDetails;
  const canUpdateStatus = canChangeStatus;

  if (!canView) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Access Restricted"
        size="md"
      >
        <div className="p-4 space-y-3 text-left">
          <p className="text-sm text-text-secondary leading-relaxed">
            You do not have permission to view details for this task. Normal members can only view details for tasks assigned to them.
          </p>
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-md text-[13px] font-medium text-text-primary border border-border bg-surface hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const isOverdue =
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    status !== "completed" &&
    status !== "done";

  const handleSave = async (e) => {
    e?.preventDefault();
    if (submitting) return;

    if (canManageFull) {
      if (!title.trim()) {
        toastError("Task title cannot be empty");
        return;
      }
      if (title.trim().length > 150) {
        toastError("Title cannot exceed 150 characters");
        return;
      }
      if (description.trim().length > 1000) {
        toastError("Description cannot exceed 1000 characters");
        return;
      }

      setSubmitting(true);
      const payload = {
        title: title.trim(),
        description: description.trim(),
        ...(status !== task.status ? { status } : {}),
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      };

      const res = await updateHandler?.(task._id || task.id, payload);
      setSubmitting(false);

      if (res?.success !== false) {
        success("Task updated successfully");
        setIsEditing(false);
        onClose();
      } else {
        toastError(res?.error || "Failed to update task");
      }
    } else if (canUpdateStatus) {
      setSubmitting(true);
      const res = await updateHandler?.(task._id || task.id, { status });
      setSubmitting(false);

      if (res?.success !== false) {
        success("Task status updated");
        onClose();
      } else {
        toastError(res?.error || "Failed to update status");
      }
    }
  };

  const handleDelete = async () => {
    if (!canDeleteTask || deleting) return;
    const confirmed = window.confirm(`Permanently delete "${task.title}"?`);
    if (!confirmed) return;

    setDeleting(true);
    const res = await deleteHandler?.(task._id || task.id);
    setDeleting(false);

    if (res?.success !== false) {
      success("Task deleted successfully");
      onClose();
    } else {
      toastError(res?.error || "Failed to delete task");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit task" : "Task details"}
      size="lg"
    >
      <div className="space-y-4 text-text-primary text-left">
        {/* Workspace / Project Badge */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderIcon className="w-4 h-4 text-text-secondary" />
            <span className="text-sm font-semibold text-text-primary">
              {project?.name || task.project?.name || "Workspace Task"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <TaskStatusDropdown
              status={status}
              canEdit={canChangeStatus}
              onUpdate={async (newStatus) => {
                setStatus(newStatus);
                const res = await updateHandler?.(task._id || task.id, { status: newStatus });
                if (res?.success !== false) {
                  triggerHistoryRefresh();
                }
                return res;
              }}
              size="xs"
            />
            <TaskPriorityDropdown
              priority={priority}
              canEdit={canChangePriority}
              onUpdate={async (newPriority) => {
                setPriority(newPriority);
                const res = await updateHandler?.(task._id || task.id, { priority: newPriority });
                if (res?.success !== false) {
                  triggerHistoryRefresh();
                }
                return res;
              }}
              size="xs"
            />
          </div>
        </div>

        {/* Task Form or View */}
        {isEditing && canEdit ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-text-secondary mb-1">
                Task title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={150}
                required
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors shadow-subtle"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-text-secondary mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Add additional context or requirements..."
                className="w-full rounded-md border border-border bg-surface p-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors resize-none shadow-subtle placeholder:text-text-tertiary"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-text-secondary mb-1">
                  Status
                </label>
                <select
                  value={status}
                  disabled={task.status === "done"}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand cursor-pointer shadow-subtle disabled:opacity-50"
                >
                  {(() => {
                    const statusOrder = [
                      { value: "todo", label: "To do" },
                      { value: "in-progress", label: "In progress" },
                      { value: "testing", label: "Testing" },
                      { value: "completed", label: "Completed" },
                      { value: "done", label: "Done" },
                    ];
                    const currentIdx = statusOrder.findIndex(
                      (opt) => opt.value === (task.status || "todo"),
                    );
                    return statusOrder.map((opt, idx) => (
                      <option
                        key={opt.value}
                        value={opt.value}
                        disabled={idx !== currentIdx && idx !== currentIdx + 1}
                      >
                        {opt.label}
                      </option>
                    ));
                  })()}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-text-secondary mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand cursor-pointer shadow-subtle"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-text-secondary mb-1">
                  Due date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand shadow-subtle"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              {canDeleteTask ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || submitting}
                  className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md text-[13px] font-medium text-[#991B1B] dark:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#3B0D0D] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <TrashIcon className="w-4 h-4" />
                  <span>{deleting ? "Deleting..." : "Delete"}</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={submitting}
                  className="h-9 px-3.5 rounded-md text-[13px] font-medium text-text-primary border border-border bg-surface hover:bg-surface-subtle transition-colors cursor-pointer shadow-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-3.5 rounded-md text-[13px] font-medium text-brand-text bg-brand hover:bg-brand-hover transition-colors shadow-subtle disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary tracking-tight leading-snug">
                {task.title}
              </h3>
              {task.description ? (
                <p className="mt-1.5 text-sm text-text-secondary leading-relaxed whitespace-pre-line">
                  {task.description}
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-text-tertiary italic">
                  No detailed description provided.
                </p>
              )}
            </div>

            {/* Overdue alert if applicable */}
            {isOverdue && (
              <div className="flex items-center gap-2.5 p-3 rounded-md bg-accent-subtle border border-accent/20 text-accent-text text-sm font-medium">
                <AlertTriangleIcon className="w-4 h-4 text-accent shrink-0" />
                <span>
                  This task is overdue. The due date was{" "}
                  {new Date(task.dueDate).toLocaleDateString()}.
                </span>
              </div>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 p-3.5 rounded-lg bg-surface-subtle border border-border text-sm">
              <div>
                <span className="text-text-tertiary block mb-1 font-medium text-[12px]">
                  Assigned members
                </span>
                {assignedUsers.length > 0 ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <AvatarGroup users={assignedUsers} size="xs" max={4} />
                    <span className="text-text-primary text-sm font-medium">
                      {assignedUsers.map((u) => u.name || u.email).join(", ")}
                    </span>
                  </div>
                ) : (
                  <span className="text-text-tertiary text-sm">Unassigned</span>
                )}
              </div>

              <div>
                <span className="text-text-tertiary block mb-1 font-medium text-[12px]">
                  Due date
                </span>
                <div className="flex items-center gap-1.5 text-text-primary text-sm font-medium">
                  <CalendarIcon className="w-4 h-4 text-text-secondary" />
                  <span>
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString(undefined, {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "No deadline specified"}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-text-tertiary block mb-1 font-medium text-[12px]">
                  Created on
                </span>
                <div className="flex items-center gap-1.5 text-text-primary text-sm">
                  <ClockIcon className="w-4 h-4 text-text-secondary" />
                  <span>
                    {task.createdAt
                      ? new Date(task.createdAt).toLocaleDateString()
                      : "Unknown"}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-text-tertiary block mb-1 font-medium text-[12px]">
                  Status
                </span>
                <TaskStatusDropdown
                  status={status}
                  canEdit={canChangeStatus}
                  onUpdate={async (newStatus) => {
                    setStatus(newStatus);
                    const res = await updateHandler?.(task._id || task.id, { status: newStatus });
                    if (res?.success !== false) {
                      triggerHistoryRefresh();
                    }
                    return res;
                  }}
                  size="sm"
                />
              </div>

              <div>
                <span className="text-text-tertiary block mb-1 font-medium text-[12px]">
                  Priority
                </span>
                <TaskPriorityDropdown
                  priority={priority}
                  canEdit={canChangePriority}
                  onUpdate={async (newPriority) => {
                    setPriority(newPriority);
                    const res = await updateHandler?.(task._id || task.id, { priority: newPriority });
                    if (res?.success !== false) {
                      triggerHistoryRefresh();
                    }
                    return res;
                  }}
                  size="sm"
                />
              </div>
            </div>

            {/* Activity History Section */}
            <div className="pt-3 border-t border-border">
              <TaskActivityHistory
                taskId={task._id || task.id}
                refreshTrigger={historyRefreshKey}
              />
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              {canDeleteTask ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md text-[13px] font-medium text-[#991B1B] dark:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#3B0D0D] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <TrashIcon className="w-4 h-4" />
                  <span>{deleting ? "Deleting..." : "Delete"}</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2.5">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="h-9 px-3.5 rounded-md text-[13px] font-medium text-brand-text bg-brand hover:bg-brand-hover transition-colors shadow-subtle cursor-pointer"
                  >
                    Edit task
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-3.5 rounded-md text-[13px] font-medium text-text-primary border border-border bg-surface hover:bg-surface-subtle transition-colors cursor-pointer shadow-subtle"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default TaskDetailModal;
