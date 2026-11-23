
import { useState } from "react";
import { StatusBadge } from "../common/Badge";
import { useToast } from "../../context/ToastContext";

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "testing", label: "Testing" },
  { value: "completed", label: "Completed" },
  { value: "done", label: "Done" },
];

export function TaskStatusDropdown({
  status = "todo",
  canEdit = false,
  onUpdate,
  disabled = false,
  size = "xs",
  className = "",
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { error: toastError, success: toastSuccess } = useToast();

  const currentIndex = STATUS_OPTIONS.findIndex((opt) => opt.value === status);
  const isDone = status === "done" || currentIndex === 4;

  if (!canEdit) {
    return <StatusBadge status={status} size={size} />;
  }

  const handleChange = async (e) => {
    e.stopPropagation();

    const newStatus = e.target.value;
    if (newStatus === status || isUpdating || disabled || isDone) return;

    const confirmed = window.confirm(
      `Are you sure you want to change status from "${status}" to "${newStatus}"?`
    );

    if (!confirmed) return;

    setIsUpdating(true);

    try {
      const res = await onUpdate?.(newStatus);

      if (res?.success === false) {
        toastError(res?.error || "Failed to update status");
      } else {
        toastSuccess?.("Status updated");
      }
    } catch (err) {
      toastError(
        err?.response?.data?.message || err?.message || "Failed to update status"
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const sizeClasses = {
    xs: "h-6 text-[12px] px-2",
    sm: "h-7 text-[12px] px-2.5",
    md: "h-9 text-sm px-3",
  }[size] || "h-6 text-[12px] px-2";

  return (
    <div
      className="inline-flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <select
        aria-label="Change status"
        value={status || "todo"}
        disabled={isUpdating || disabled || isDone}
        onChange={handleChange}
        className={`rounded border border-border bg-surface-subtle font-medium text-text-primary outline-none focus:border-brand cursor-pointer disabled:opacity-50 transition-colors shadow-subtle ${sizeClasses} ${className}`}
      >
        {STATUS_OPTIONS.map((opt, index) => {
          const isCurrent = opt.value === status;
          const isNext = index === currentIndex + 1;
          return (
            <option
              key={opt.value}
              value={opt.value}
              disabled={!isCurrent && !isNext}
            >
              {opt.label}
            </option>
          );
        })}
      </select>

      {isUpdating && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent shrink-0" />
      )}
    </div>
  );
}

export default TaskStatusDropdown;
