
import { useState } from "react";
import { AvatarGroup } from "../common/Avatar";
import {
  CalendarIcon,
  TrashIcon,
} from "../common/Icons";
import { useAuth } from "../../context/AuthContext";
import { getAssigneeDisplay, getEntityId, getTaskPermissions } from "../../utils/taskPermissions";
import TaskStatusDropdown from "./TaskStatusDropdown";
import TaskPriorityDropdown from "./TaskPriorityDropdown";

export function TaskCard({
  task,
  projects = [],
  user,
  onUpdate,
  onDelete,
  onClick,
}) {
  const [deleting, setDeleting] = useState(false);

  const { user: authUser } = useAuth();
  const effectiveUser = user || authUser;

  const projectId = getEntityId(task.project);
  const project = projects.find(
    (item) => getEntityId(item) === String(projectId),
  );

  const {
    canView,
    canChangeStatus,
    canChangePriority,
    canDeleteTask,
  } = getTaskPermissions(task, project, effectiveUser);

  const {
    assignedUsers,
    shortLabel: workerLabel,
    fullLabel: allWorkersLabel,
  } = getAssigneeDisplay(task, project);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!onDelete || deleting) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${task.title}"?`,
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      await onDelete(task._id || task.id);
    } catch (error) {
      console.error("Task deletion failed:", error);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (date) =>
    date
      ? new Date(date).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
      : null;

  const formattedDueDate = formatDate(task.dueDate);
  const formattedScheduledDate = formatDate(task.scheduledStartAt);
  const formattedStartedAt = formatDate(task.startedAt);
  const formattedCompletedAt = formatDate(task.completedAt);

  const isOverdue =
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    task.status !== "completed" &&
    task.status !== "done";

  const formatDuration = (seconds = 0) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <article
      onClick={() => {
        if (canView && onClick) onClick(task);
      }}
      className={`group relative flex flex-col justify-between rounded-lg border border-border bg-surface p-3.5 shadow-subtle transition-colors ${canView
          ? "hover:bg-surface-subtle/50 hover:border-brand/40 cursor-pointer"
          : "opacity-85 cursor-default"
        } text-left`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TaskStatusDropdown
              status={task.status}
              canEdit={canChangeStatus}
              onUpdate={(newStatus) =>
                onUpdate?.(task._id || task.id, { status: newStatus })
              }
              size="xs"
            />

            <TaskPriorityDropdown
              priority={task.priority}
              canEdit={canChangePriority}
              onUpdate={(newPriority) =>
                onUpdate?.(task._id || task.id, { priority: newPriority })
              }
              size="xs"
            />
          </div>

          {canDeleteTask && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded p-1 text-text-tertiary hover:bg-[#FEF2F2] hover:text-[#991B1B] dark:hover:bg-[#3B0D0D] dark:hover:text-[#F87171] transition opacity-0 group-hover:opacity-100 disabled:opacity-50 cursor-pointer"
              title="Delete task"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <h4 className="mt-2 text-sm font-semibold text-text-primary group-hover:text-brand transition-colors line-clamp-2 leading-snug">
          {task.title}
        </h4>

        {task.description && (
          <p className="mt-1 text-[13px] text-text-secondary line-clamp-2 leading-relaxed">
            {task.description}
          </p>
        )}

        <div className="mt-3 space-y-1.5">
          {formattedScheduledDate && (
            <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
              <CalendarIcon className="h-3 w-3 shrink-0" />
              <span>Scheduled: {formattedScheduledDate}</span>
            </div>
          )}

          {formattedDueDate && (
            <div
              className={`flex items-center gap-1.5 text-[12px] ${isOverdue ? "text-accent font-semibold" : "text-text-secondary"
                }`}
            >
              <CalendarIcon className="h-3 w-3 shrink-0" />
              <span>Due: {formattedDueDate}</span>
              {isOverdue && <span>(Overdue)</span>}
            </div>
          )}

          {formattedStartedAt && (
            <p className="text-[12px] text-text-secondary">
              Started: {formattedStartedAt}
            </p>
          )}

          {formattedCompletedAt && (
            <p className="text-[12px] text-text-secondary">
              Completed: {formattedCompletedAt}
            </p>
          )}

          {task.timeSpentSeconds > 0 && (
            <p className="text-[12px] font-medium text-text-secondary">
              Time spent: {formatDuration(task.timeSpentSeconds)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-border-subtle pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className="truncate rounded-md bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-text-secondary border border-border max-w-[115px] shrink-0"
            title={project?.name || task.project?.name}
          >
            {project?.name || task.project?.name || "Workspace"}
          </span>

          {assignedUsers.length > 0 ? (
            <div
              className="flex items-center gap-1.5 min-w-0"
              title={allWorkersLabel}
            >
              <AvatarGroup users={assignedUsers} size="xs" max={2} />
              <span className="truncate text-[12px] font-medium text-text-secondary">
                {workerLabel}
              </span>
            </div>
          ) : (
            <span className="text-[12px] text-text-tertiary">Unassigned</span>
          )}
        </div>
      </div>
    </article>
  );
}

export default TaskCard;
