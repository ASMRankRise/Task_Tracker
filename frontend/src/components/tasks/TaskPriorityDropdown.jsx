
import { useState } from "react";
import { PriorityBadge } from "../common/Badge";
import { useToast } from "../../context/ToastContext";

export function TaskPriorityDropdown({
  priority = "low",
  canEdit = false,
  onUpdate,
  disabled = false,
  size = "xs",
  className = "",
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { error: toastError, success: toastSuccess } = useToast();

  if (!canEdit) {
    return <PriorityBadge priority={priority} size={size} />;
  }

  const handleChange = async (e) => {
    e.stopPropagation();

    const newPriority = e.target.value;
    if (newPriority === priority || isUpdating || disabled) return;

    const confirmed = window.confirm(
      `Are you sure you want to change priority from "${priority}" to "${newPriority}"?`
    );

    if (!confirmed) return;

    setIsUpdating(true);

    try {
      const res = await onUpdate?.(newPriority);

      if (res?.success === false) {
        toastError(res?.error || "Failed to update priority");
      } else {
        toastSuccess?.("Priority updated");
      }
    } catch (err) {
      toastError(
        err?.response?.data?.message || err?.message || "Failed to update priority"
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
        aria-label="Change priority"
        value={priority || "low"}
        disabled={isUpdating || disabled}
        onChange={handleChange}
        className={`rounded border border-border bg-surface-subtle font-medium text-text-primary outline-none focus:border-brand cursor-pointer disabled:opacity-50 transition-colors shadow-subtle ${sizeClasses} ${className}`}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>

      {isUpdating && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent shrink-0" />
      )}
    </div>
  );
}

export default TaskPriorityDropdown;
