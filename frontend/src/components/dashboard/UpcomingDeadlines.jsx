import { StatusBadge, PriorityBadge } from "../common/Badge";
import { CalendarIcon, AlertTriangleIcon, CheckCircleIcon } from "../common/Icons";
import { getAssigneeDisplay } from "../../utils/taskPermissions";

export function UpcomingDeadlines({ tasks = [], onTaskClick }) {
  // Filter active tasks that have a valid dueDate
  const activeTasksWithDueDate = tasks
    .filter(
      (t) =>
        t.dueDate &&
        !isNaN(new Date(t.dueDate).getTime()) &&
        t.status !== "completed" &&
        t.status !== "done"
    )
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const topDeadlines = activeTasksWithDueDate.slice(0, 6);

  const getDaysDiff = (dateStr) => {
    const due = new Date(dateStr);
    if (isNaN(due.getTime())) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffTime = due - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4 text-left shadow-subtle">
      <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-text-secondary" />
            <span>Upcoming Deadlines</span>
          </h3>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Active milestones requiring prompt attention
          </p>
        </div>
        <span className="rounded-md border border-border bg-surface-subtle px-2.5 py-0.5 text-[12px] font-medium text-text-secondary">
          {activeTasksWithDueDate.length} upcoming
        </span>
      </div>

      {topDeadlines.length === 0 ? (
        <div className="py-6 text-center text-sm text-text-secondary">
          <CheckCircleIcon className="w-5 h-5 text-done mx-auto mb-1.5 opacity-90" />
          No upcoming deadlines. All active work is on schedule!
        </div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {topDeadlines.map((task) => {
            const daysDiff = getDaysDiff(task.dueDate);
            const isOverdue = daysDiff < 0;
            const isToday = daysDiff === 0;
            const {
              assignedUsers,
              shortLabel: workerLabel,
              fullLabel: allWorkersLabel,
            } = getAssigneeDisplay(task);

            return (
              <div
                key={task._id || task.id}
                onClick={() => onTaskClick && onTaskClick(task)}
                className="py-2.5 flex items-center justify-between gap-3 hover:bg-surface-subtle rounded-md px-2.5 -mx-2.5 transition-colors cursor-pointer group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary group-hover:text-brand transition-colors truncate">
                      {task.title}
                    </span>
                    <PriorityBadge priority={task.priority} size="xs" />
                  </div>
                  <div className="text-[12px] text-text-secondary flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="truncate max-w-[140px]">
                      {task.project?.name || "Workspace"}
                    </span>
                    <span>•</span>
                    <StatusBadge status={task.status} size="xs" />
                    {assignedUsers.length > 0 && (
                      <>
                        <span>•</span>
                        <span
                          className="truncate max-w-[140px] font-medium text-text-primary"
                          title={allWorkersLabel}
                        >
                          {workerLabel}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium border ${
                      isOverdue
                        ? "bg-accent-subtle text-accent-text border-accent/20 font-semibold"
                        : isToday
                        ? "bg-[#FFF4EC] text-[#9A3412] border-[#FBD6BA] dark:bg-[#341708] dark:text-[#FB923C] dark:border-[#5C2A10] font-semibold"
                        : "bg-surface-subtle text-text-secondary border-border"
                    }`}
                  >
                    {isOverdue && <AlertTriangleIcon className="w-3.5 h-3.5 text-accent" />}
                    {isOverdue
                      ? `${Math.abs(daysDiff)}d overdue`
                      : isToday
                      ? "Due today"
                      : `${daysDiff}d left`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default UpcomingDeadlines;
