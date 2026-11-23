import { useState, useEffect, useCallback } from "react";
import api from "../../services/api";
import { Avatar } from "../common/Avatar";
import { StatusBadge, PriorityBadge } from "../common/Badge";
import {
  ClockIcon,
  CalendarIcon,
  RotateCwIcon,
  TrendingUpIcon,
  UserPlusIcon,
  CheckCircleIcon,
  BadgeCheckIcon,
  ArrowRightIcon,
  SparklesIcon,
  AlertCircleIcon,
  CheckSquareIcon,
} from "../common/Icons";

function formatActivityTime(dateStr) {
  if (!dateStr) return { relative: "Just now", fullTime: "" };
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { relative: dateStr, fullTime: dateStr };

  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  let relative;
  if (diffSec < 45) {
    relative = "Just now";
  } else if (diffMin < 60) {
    relative = `${diffMin}m ago`;
  } else if (diffHours < 24) {
    relative = `${diffHours}h ago`;
  } else if (diffDays === 1) {
    relative = "Yesterday";
  } else if (diffDays < 7) {
    relative = `${diffDays}d ago`;
  } else {
    relative = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }

  const fullTime = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return { relative, fullTime };
}

function formatDateValue(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getActivityConfig(activity) {
  const { action, oldValue, newValue } = activity;

  switch (action) {
    case "created":
      return {
        icon: SparklesIcon,
        iconBg:
          "bg-[#EAF2ED] text-[#154336] border-[#BCD4CA] dark:bg-[#163328] dark:text-[#34D399] dark:border-[#225040]",
        actionLabel: "created this task",
        renderDetails: () => (
          <p className="mt-1 text-xs text-text-secondary">
            Task created with title{" "}
            <span className="font-medium text-text-primary">
              "{newValue || "Untitled"}"
            </span>
          </p>
        ),
      };

    case "status_changed":
      return {
        icon: RotateCwIcon,
        iconBg:
          "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE] dark:bg-[#172554] dark:text-[#60A5FA] dark:border-[#1E40AF]",
        actionLabel: "updated status",
        renderDetails: () => (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {oldValue ? (
              <StatusBadge status={oldValue} size="xs" />
            ) : (
              <span className="text-xs text-text-tertiary">None</span>
            )}
            <ArrowRightIcon className="w-3 h-3 text-text-tertiary shrink-0" />
            <StatusBadge status={newValue} size="xs" />
          </div>
        ),
      };

    case "priority_changed":
      return {
        icon: TrendingUpIcon,
        iconBg:
          "bg-[#FFF4EC] text-[#9A3412] border-[#FBD6BA] dark:bg-[#341708] dark:text-[#FB923C] dark:border-[#5C2A10]",
        actionLabel: "updated priority",
        renderDetails: () => (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {oldValue ? (
              <PriorityBadge priority={oldValue} size="xs" />
            ) : (
              <span className="text-xs text-text-tertiary">None</span>
            )}
            <ArrowRightIcon className="w-3 h-3 text-text-tertiary shrink-0" />
            <PriorityBadge priority={newValue} size="xs" />
          </div>
        ),
      };

    case "due_date_changed":
      return {
        icon: CalendarIcon,
        iconBg:
          "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A] dark:bg-[#451A03] dark:text-[#FCD34D] dark:border-[#78350F]",
        actionLabel: "changed due date",
        renderDetails: () => (
          <div className="mt-1 flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-text-tertiary line-through">
              {formatDateValue(oldValue) || "No due date"}
            </span>
            <ArrowRightIcon className="w-3 h-3 text-text-tertiary shrink-0" />
            <span className="font-medium text-text-primary">
              {formatDateValue(newValue) || "No due date"}
            </span>
          </div>
        ),
      };

    case "schedule_changed":
      return {
        icon: ClockIcon,
        iconBg:
          "bg-[#F1EDE4] text-[#57534E] border-[#E4DED4] dark:bg-[#232726] dark:text-[#A8A29E] dark:border-[#2E3432]",
        actionLabel: "updated schedule",
        renderDetails: () => (
          <div className="mt-1 flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-text-tertiary line-through">
              {formatDateValue(oldValue) || "Not scheduled"}
            </span>
            <ArrowRightIcon className="w-3 h-3 text-text-tertiary shrink-0" />
            <span className="font-medium text-text-primary">
              {formatDateValue(newValue) || "Not scheduled"}
            </span>
          </div>
        ),
      };

    case "assigned":
      return {
        icon: UserPlusIcon,
        iconBg:
          "bg-[#F3E8FF] text-[#6B21A8] border-[#DDD6FE] dark:bg-[#2E1065] dark:text-[#C084FC] dark:border-[#581C87]",
        actionLabel: "updated assigned members",
        renderDetails: () => (
          <p className="mt-1 text-xs text-text-secondary">
            Task member assignment was updated
          </p>
        ),
      };

    case "submitted":
      return {
        icon: CheckSquareIcon,
        iconBg:
          "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE] dark:bg-[#172554] dark:text-[#60A5FA] dark:border-[#1E40AF]",
        actionLabel: "submitted task",
        renderDetails: () => (
          <p className="mt-1 text-xs text-text-secondary">
            Task submitted for review
          </p>
        ),
      };

    case "completed":
      return {
        icon: BadgeCheckIcon,
        iconBg:
          "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0] dark:bg-[#052E16] dark:text-[#4ADE80] dark:border-[#14532D]",
        actionLabel: "marked as completed",
        renderDetails: () => (
          <p className="mt-1 text-xs text-[#166534] dark:text-[#4ADE80] font-medium">
            Task was marked as completed
          </p>
        ),
      };

    default:
      return {
        icon: CheckCircleIcon,
        iconBg:
          "bg-[#F1EDE4] text-[#57534E] border-[#E4DED4] dark:bg-[#232726] dark:text-[#A8A29E] dark:border-[#2E3432]",
        actionLabel: action ? action.replace(/_/g, " ") : "updated task",
        renderDetails: () =>
          oldValue || newValue ? (
            <div className="mt-1 flex items-center gap-1.5 flex-wrap text-xs">
              <span className="text-text-tertiary line-through">
                {String(oldValue || "none")}
              </span>
              <ArrowRightIcon className="w-3 h-3 text-text-tertiary shrink-0" />
              <span className="font-medium text-text-primary">
                {String(newValue || "none")}
              </span>
            </div>
          ) : null,
      };
  }
}

export function TaskActivityHistory({ taskId, refreshTrigger, className = "" }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(
    async (isManualRefresh = false) => {
      if (!taskId) return;

      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await api.get(`/tasks/${taskId}/history`);
        const data = Array.isArray(response.data?.activities)
          ? response.data.activities
          : [];
        setActivities(data);
      } catch (err) {
        console.error("Failed to load task activity history:", err);
        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to load activity history"
        );
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [taskId]
  );

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshTrigger]);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClockIcon className="w-4 h-4 text-text-secondary" />
          <h4 className="text-[13px] font-semibold text-text-primary tracking-tight">
            Activity history
          </h4>
          {!loading && activities.length > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[11px] font-medium bg-surface-subtle text-text-secondary border border-border">
              {activities.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => fetchHistory(true)}
          disabled={loading || isRefreshing}
          title="Refresh history"
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer disabled:opacity-50"
          aria-label="Refresh activity history"
        >
          <RotateCwIcon
            className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-brand" : ""}`}
          />
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-border-subtle bg-surface-subtle/40">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span className="mt-2 text-xs font-medium text-text-secondary">
            Loading activity history...
          </span>
        </div>
      ) : error ? (
        <div className="flex items-center justify-between p-3 rounded-lg border border-accent/20 bg-accent-subtle text-accent-text text-xs">
          <div className="flex items-center gap-2">
            <AlertCircleIcon className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchHistory(false)}
            className="font-medium underline hover:text-accent cursor-pointer ml-3 shrink-0"
          >
            Retry
          </button>
        </div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-7 px-4 rounded-lg border border-dashed border-border bg-surface-subtle/30 text-center">
          <ClockIcon className="w-5 h-5 text-text-tertiary mb-1.5 opacity-60" />
          <p className="text-xs font-semibold text-text-primary">
            No activity recorded yet
          </p>
          <p className="text-[11px] text-text-tertiary mt-0.5 max-w-xs">
            Status changes, priority updates, due dates, and assignments will
            appear here.
          </p>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto pr-1">
          <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
            {activities.map((activity, idx) => {
              const meta = getActivityConfig(activity);
              const { relative, fullTime } = formatActivityTime(
                activity.createdAt
              );
              const actorName =
                activity.user?.name || activity.user?.email || "Unknown user";
              const IconComponent = meta.icon;

              return (
                <div key={activity._id || idx} className="relative group">
                  {/* Timeline Node Icon */}
                  <div
                    className={`absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full border shadow-subtle ${meta.iconBg}`}
                  >
                    <IconComponent className="h-2.5 w-2.5" />
                  </div>

                  {/* Activity Details Card */}
                  <div className="rounded-md border border-border-subtle bg-surface p-2.5 text-xs shadow-subtle hover:border-border transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Avatar user={activity.user} size="xs" />
                        <span className="font-semibold text-text-primary truncate">
                          {actorName}
                        </span>
                        <span className="text-text-tertiary text-[11px] truncate">
                          {meta.actionLabel}
                        </span>
                      </div>

                      <span
                        className="text-[11px] text-text-tertiary shrink-0 font-mono"
                        title={fullTime}
                      >
                        {relative}
                      </span>
                    </div>

                    {meta.renderDetails()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskActivityHistory;
