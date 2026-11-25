import { useState, useEffect, useMemo, useCallback } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import useProjects from "../../hooks/useProjects";
import {
  CopyIcon,
  CheckCircleIcon,
  CalendarIcon,
  UserIcon,
  RotateCwIcon,
  FileTextIcon,
  FolderIcon,
  CheckSquareIcon,
} from "../common/Icons";
import Button from "../common/Button";
import { StatusBadge } from "../common/Badge";

function getLocalDateString(dateInput = new Date()) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getEntityId(item) {
  if (!item) return "";
  if (typeof item === "object") {
    return String(item._id || item.id || item.userId || "");
  }
  return String(item);
}

export function ReportsPage() {
  const { user: currentUser } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();
  const { projects, fetchProjects } = useProjects();

  const isElevated =
    currentUser?.role === "admin" || currentUser?.role === "superadmin";

  const currentUserId = getEntityId(currentUser);

  // Check if current user is owner or project head of any project
  const canSelectOtherMembers = useMemo(() => {
    if (isElevated) return true;
    if (!currentUserId) return false;
    return projects.some((p) => {
      const ownerId = getEntityId(p.owner);
      const headId = getEntityId(p.projectHead);
      return (
        (ownerId && ownerId === currentUserId) ||
        (headId && headId === currentUserId)
      );
    });
  }, [isElevated, projects, currentUserId]);

  // States
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState(currentUserId || "");
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reportFormat, setReportFormat] = useState("numbered"); // "numbered" | "grouped" | "markdown"
  const [scopeFilter, setScopeFilter] = useState("all-active"); // "all-active" | "today-only" | "completed-only"
  const [customNotes, setCustomNotes] = useState("");

  // Sync selectedMemberId once currentUser is loaded
  useEffect(() => {
    if (!selectedMemberId && currentUserId) {
      setSelectedMemberId(currentUserId);
    }
  }, [currentUserId, selectedMemberId]);

  // Load projects if not loaded
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // 1. Fetch team members (Admin API or extract from accessible projects)
  useEffect(() => {
    let isMounted = true;
    const loadMembers = async () => {
      setLoadingMembers(true);
      try {
        if (isElevated) {
          try {
            const res = await api.get("/admin/users");
            if (isMounted && Array.isArray(res.data?.users)) {
              setTeamMembers(res.data.users);
              return;
            }
          } catch {
            // fallback to project members
          }
        }

        // Build member map from user & accessible projects
        const memberMap = new Map();
        if (currentUser) {
          memberMap.set(currentUserId, {
            _id: currentUserId,
            name: currentUser.name || "Me",
            email: currentUser.email || "",
            role: currentUser.role || "user",
          });
        }

        if (canSelectOtherMembers) {
          projects.forEach((proj) => {
            if (proj.owner && typeof proj.owner === "object") {
              const id = getEntityId(proj.owner);
              if (id) memberMap.set(id, proj.owner);
            }
            if (proj.projectHead && typeof proj.projectHead === "object") {
              const id = getEntityId(proj.projectHead);
              if (id) memberMap.set(id, proj.projectHead);
            }
            if (Array.isArray(proj.members)) {
              proj.members.forEach((m) => {
                if (m && typeof m === "object") {
                  const id = getEntityId(m);
                  if (id) memberMap.set(id, m);
                }
              });
            }
          });
        }

        if (isMounted) {
          setTeamMembers(Array.from(memberMap.values()));
        }
      } finally {
        if (isMounted) setLoadingMembers(false);
      }
    };

    loadMembers();
    return () => {
      isMounted = false;
    };
  }, [isElevated, currentUser, currentUserId, projects, canSelectOtherMembers]);

  // 2. Fetch tasks for selected member
  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const params = { limit: 100 };
      if (selectedMemberId && selectedMemberId !== "all") {
        params.assignedTo = selectedMemberId;
      }
      const response = await api.get("/tasks", { params });
      setTasks(response.data?.tasks || []);
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to fetch tasks.");
    } finally {
      setLoadingTasks(false);
    }
  }, [selectedMemberId, toastError]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 3. Filter tasks matching the selected member and date/scope criteria
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Member assignment check:
      // If task.assignedTo has entries, verify selectedMemberId matches.
      // If backend sanitized task.assignedTo to [] (due to role restrictions),
      // trust the backend filter since we requested assignedTo in the API params.
      if (selectedMemberId && selectedMemberId !== "all") {
        const hasAssigneeArray =
          Array.isArray(task.assignedTo) && task.assignedTo.length > 0;
        if (hasAssigneeArray) {
          const assignees = task.assignedTo.map(getEntityId);
          if (!assignees.includes(selectedMemberId)) {
            return false;
          }
        }
      }

      // Check dates
      const taskDates = [
        task.completedAt,
        task.doneAt,
        task.updatedAt,
        task.scheduledStartAt,
        task.dueDate,
        task.createdAt,
      ]
        .filter(Boolean)
        .map((d) => getLocalDateString(d));

      const isForSelectedDate = taskDates.includes(selectedDate);
      const isCompleted = task.status === "completed" || task.status === "done";
      const isInProgress = task.status === "in-progress";

      if (scopeFilter === "completed-only") {
        return isCompleted && (isForSelectedDate || !selectedDate);
      }

      if (scopeFilter === "today-only") {
        return isForSelectedDate;
      }

      // Default: "all-active"
      // Crucial fix: Completed tasks ONLY count if completed on selected date!
      // In-progress tasks count because they are actively being worked on.
      // Other tasks (todo/testing) count if scheduled/updated on selected date.
      if (isCompleted) {
        return isForSelectedDate;
      }
      return isForSelectedDate || isInProgress;
    });
  }, [tasks, selectedMemberId, selectedDate, scopeFilter]);

  // 4. Identify selected member object & name
  const selectedMemberObj = useMemo(() => {
    if (selectedMemberId === "all") return null;
    return (
      teamMembers.find((m) => getEntityId(m) === selectedMemberId) || currentUser
    );
  }, [teamMembers, selectedMemberId, currentUser]);

  const memberDisplayName = useMemo(() => {
    if (selectedMemberId === "all") return "Team Consolidated Summary";
    return (
      selectedMemberObj?.name ||
      selectedMemberObj?.email ||
      currentUser?.name ||
      "Team Member"
    );
  }, [selectedMemberId, selectedMemberObj, currentUser]);

  // 5. Construct the Auto-Generated Report text
  const generatedReportText = useMemo(() => {
    const dateFormatted = formatDisplayDate(selectedDate);
    const headerTitle = `Daily Status Report — ${memberDisplayName}`;
    const divider = "----------------------------------------";

    if (filteredTasks.length === 0) {
      return `${headerTitle}\nDate: ${dateFormatted}\n\nNo task updates recorded for this date.`;
    }

    // Helper for task title + project name
    const getTaskLabel = (t) => {
      const projName = t.project?.name ? ` [${t.project.name}]` : "";
      return `${t.title}${projName}`;
    };

    const getStatusLabel = (t) => {
      if (t.status === "completed" || t.status === "done") return "Completed";
      if (t.status === "in-progress") return "In Progress";
      if (t.status === "testing") return "Testing";
      return "To Do";
    };

    // Special: All Members Grouped View
    if (selectedMemberId === "all") {
      const groupedByMember = {};
      filteredTasks.forEach((t) => {
        const assignees =
          Array.isArray(t.assignedTo) && t.assignedTo.length > 0
            ? t.assignedTo
            : [{ name: "Unassigned" }];

        assignees.forEach((a) => {
          const name = a.name || a.email || "Unassigned";
          if (!groupedByMember[name]) groupedByMember[name] = [];
          groupedByMember[name].push(t);
        });
      });

      let text = `Team Daily Standup Report\nDate: ${dateFormatted}\n========================================\n\n`;
      Object.entries(groupedByMember).forEach(([name, memberTasks]) => {
        text += `${name}:\n`;
        memberTasks.forEach((t, i) => {
          text += `  ${i + 1}. ${getTaskLabel(t)} - ${getStatusLabel(t)}\n`;
        });
        text += "\n";
      });
      text += `========================================\nTotal Tasks Reported: ${filteredTasks.length}`;

      if (customNotes.trim()) {
        text += `\n\nAdditional Notes:\n${customNotes.trim()}`;
      }
      return text;
    }

    // Single Member: Numbered List (Task One, Task Two, Task Three - Completed)
    if (reportFormat === "numbered") {
      const lines = filteredTasks.map((t, idx) => {
        return `${idx + 1}. ${getTaskLabel(t)} - ${getStatusLabel(t)}`;
      });

      let text = `${headerTitle}\nDate: ${dateFormatted}\n\n${lines.join("\n")}`;

      const completedCount = filteredTasks.filter(
        (t) => t.status === "completed" || t.status === "done",
      ).length;
      const inProgressCount = filteredTasks.filter(
        (t) => t.status === "in-progress",
      ).length;
      const pendingCount = filteredTasks.length - completedCount - inProgressCount;

      text += `\n\n${divider}\nSummary: ${completedCount} Completed | ${inProgressCount} In Progress | ${pendingCount} Pending`;

      if (customNotes.trim()) {
        text += `\n\nNotes / Blockers:\n${customNotes.trim()}`;
      }
      return text;
    }

    // Single Member: Grouped by Status
    if (reportFormat === "grouped") {
      const completed = filteredTasks.filter(
        (t) => t.status === "completed" || t.status === "done",
      );
      const inProgress = filteredTasks.filter((t) => t.status === "in-progress");
      const testing = filteredTasks.filter((t) => t.status === "testing");
      const todo = filteredTasks.filter((t) => t.status === "todo");

      let text = `${headerTitle}\nDate: ${dateFormatted}\n${divider}\n`;

      if (completed.length) {
        text +=
          `\nCompleted Tasks:\n` +
          completed.map((t) => `• ${getTaskLabel(t)}`).join("\n") +
          "\n";
      }
      if (inProgress.length) {
        text +=
          `\nIn Progress:\n` +
          inProgress.map((t) => `• ${getTaskLabel(t)}`).join("\n") +
          "\n";
      }
      if (testing.length) {
        text +=
          `\nIn Testing:\n` +
          testing.map((t) => `• ${getTaskLabel(t)}`).join("\n") +
          "\n";
      }
      if (todo.length) {
        text +=
          `\nTo Do / Planned:\n` +
          todo.map((t) => `• ${getTaskLabel(t)}`).join("\n") +
          "\n";
      }

      text += `\n${divider}\nSummary: ${completed.length} Completed | ${inProgress.length} In Progress | ${todo.length} To Do`;

      if (customNotes.trim()) {
        text += `\n\nNotes / Blockers:\n${customNotes.trim()}`;
      }
      return text;
    }

    // Single Member: Markdown Format
    if (reportFormat === "markdown") {
      let text = `### Daily Update — ${memberDisplayName}\n**Date:** ${dateFormatted}\n\n`;

      filteredTasks.forEach((t) => {
        const isDone = t.status === "completed" || t.status === "done";
        const isInProg = t.status === "in-progress";
        const box = isDone ? "[x]" : isInProg ? "[/]" : "[ ]";
        text += `- ${box} ${getTaskLabel(t)} *(${getStatusLabel(t)})*\n`;
      });

      if (customNotes.trim()) {
        text += `\n**Notes / Blockers:**\n${customNotes.trim()}`;
      }
      return text;
    }

    return "";
  }, [
    filteredTasks,
    memberDisplayName,
    selectedDate,
    reportFormat,
    selectedMemberId,
    customNotes,
  ]);

  // 6. Copy action with visual and toast feedback
  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(generatedReportText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = generatedReportText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopied(true);
      toastSuccess("Report copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toastError("Failed to copy report to clipboard.");
    }
  };

  const handleSetQuickDate = (type) => {
    if (type === "today") {
      setSelectedDate(getLocalDateString());
    } else if (type === "yesterday") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      setSelectedDate(getLocalDateString(d));
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-text shadow-subtle">
              <FileTextIcon className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">
              Daily Reports
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1 ml-10">
            Auto-generate and copy task progress for standup meetings, team updates, or EOD reporting.
          </p>
        </div>

        <Button
          onClick={handleCopy}
          className="flex items-center justify-center gap-2 bg-brand text-brand-text hover:bg-brand/90 px-4 py-2 text-sm font-medium shadow-subtle transition-all cursor-pointer"
        >
          {copied ? (
            <CheckCircleIcon className="w-4 h-4 text-emerald-300 animate-pulse" />
          ) : (
            <CopyIcon className="w-4 h-4" />
          )}
          <span>{copied ? "Copied to Clipboard!" : "Copy Report"}</span>
        </Button>
      </div>

      {/* Control Panel: Member Selection, Date, and Format */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-surface border border-border rounded-xl p-4 shadow-subtle">
        {/* Member Selector */}
        <div>
          <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5 text-text-secondary" />
            Team Member
          </label>
          <div className="relative">
            {canSelectOtherMembers ? (
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer"
              >
                {isElevated && (
                  <option value="all">👥 All Members (Consolidated Standup)</option>
                )}
                {teamMembers.map((member) => {
                  const id = getEntityId(member);
                  const isMe = id === currentUserId;
                  return (
                    <option key={id} value={id}>
                      {member.name || member.email} {isMe ? "(You)" : ""}
                    </option>
                  );
                })}
              </select>
            ) : (
              <div className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-text-primary font-medium flex items-center justify-between">
                <span>{currentUser?.name || currentUser?.email || "Me"} (You)</span>
                <span className="text-[11px] text-text-tertiary">Personal</span>
              </div>
            )}
          </div>
          {loadingMembers && canSelectOtherMembers && (
            <span className="text-[11px] text-text-tertiary mt-1 block">
              Loading team directory...
            </span>
          )}
        </div>

        {/* Date Selector & Quick Toggles */}
        <div>
          <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-text-secondary" />
              Report Date
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleSetQuickDate("today")}
                className="text-[11px] font-medium text-brand hover:underline cursor-pointer"
              >
                Today
              </button>
              <span className="text-text-tertiary text-[10px]">•</span>
              <button
                type="button"
                onClick={() => handleSetQuickDate("yesterday")}
                className="text-[11px] font-medium text-text-secondary hover:text-text-primary cursor-pointer"
              >
                Yesterday
              </button>
            </div>
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer"
          />
        </div>

        {/* Format Selector & Refresh */}
        <div>
          <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>Format Style</span>
            <button
              type="button"
              onClick={loadTasks}
              title="Refresh Tasks"
              className="text-text-tertiary hover:text-text-primary transition cursor-pointer flex items-center gap-1 text-[11px]"
            >
              <RotateCwIcon
                className={`w-3 h-3 ${loadingTasks ? "animate-spin" : ""}`}
              />
              <span>Refresh</span>
            </button>
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setReportFormat("numbered")}
              className={`py-2 px-2 text-xs font-medium rounded-lg border transition text-center cursor-pointer ${
                reportFormat === "numbered"
                  ? "bg-brand text-brand-text border-brand shadow-subtle font-semibold"
                  : "bg-surface-subtle text-text-secondary border-border hover:text-text-primary hover:bg-surface-subtle/80"
              }`}
            >
              Numbered
            </button>
            <button
              type="button"
              onClick={() => setReportFormat("grouped")}
              className={`py-2 px-2 text-xs font-medium rounded-lg border transition text-center cursor-pointer ${
                reportFormat === "grouped"
                  ? "bg-brand text-brand-text border-brand shadow-subtle font-semibold"
                  : "bg-surface-subtle text-text-secondary border-border hover:text-text-primary hover:bg-surface-subtle/80"
              }`}
            >
              Grouped
            </button>
            <button
              type="button"
              onClick={() => setReportFormat("markdown")}
              className={`py-2 px-2 text-xs font-medium rounded-lg border transition text-center cursor-pointer ${
                reportFormat === "markdown"
                  ? "bg-brand text-brand-text border-brand shadow-subtle font-semibold"
                  : "bg-surface-subtle text-text-secondary border-border hover:text-text-primary hover:bg-surface-subtle/80"
              }`}
            >
              Markdown
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Output Preview & Task Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Auto-generated Text & One-Click Copy */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-surface border border-border rounded-xl shadow-subtle overflow-hidden">
            {/* Box Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-subtle/50">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                  Generated Report Output
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-text-secondary font-medium">
                  {filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                  className="text-xs flex items-center gap-1.5 text-text-primary hover:bg-surface-subtle px-2.5 py-1 rounded-md cursor-pointer"
                >
                  {copied ? (
                    <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <CopyIcon className="w-3.5 h-3.5" />
                  )}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </Button>
              </div>
            </div>

            {/* Generated Code/Text Box */}
            <div className="p-4">
              <pre className="font-mono text-xs sm:text-sm bg-surface-subtle border border-border rounded-lg p-4 text-text-primary whitespace-pre-wrap leading-relaxed overflow-x-auto selection:bg-brand/20 min-h-[220px]">
                {loadingTasks ? (
                  <div className="flex items-center justify-center py-12 text-text-tertiary gap-2">
                    <RotateCwIcon className="w-4 h-4 animate-spin" />
                    <span>Auto-generating report...</span>
                  </div>
                ) : (
                  generatedReportText
                )}
              </pre>
            </div>

            {/* Optional Notes / Blockers Input */}
            <div className="px-4 pb-4 pt-1 border-t border-border/60">
              <label className="block text-[11px] font-medium text-text-secondary mb-1">
                Optional: Add Blockers or Extra Standup Notes
              </label>
              <input
                type="text"
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="e.g. Blocker: Waiting for API key approval"
                className="w-full rounded-md border border-border bg-surface-subtle px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Filter & Live Task Cards */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-surface border border-border rounded-xl p-4 shadow-subtle space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquareIcon className="w-4 h-4 text-text-secondary" />
                <h3 className="text-sm font-semibold text-text-primary">
                  Included Tasks ({filteredTasks.length})
                </h3>
              </div>

              {/* Scope filter selector */}
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                className="text-xs bg-surface-subtle border border-border rounded-md px-2 py-1 text-text-secondary focus:outline-none cursor-pointer"
              >
                <option value="all-active">Active & Today's</option>
                <option value="today-only">Strictly Today's</option>
                <option value="completed-only">Completed Only</option>
              </select>
            </div>

            {loadingTasks ? (
              <div className="py-8 text-center text-xs text-text-tertiary">
                Fetching tasks...
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-tertiary border border-dashed border-border rounded-lg p-4">
                No tasks match the selected date or member.
              </div>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {filteredTasks.map((task) => {
                  const taskId = getEntityId(task);
                  return (
                    <div
                      key={taskId}
                      className="p-2.5 rounded-lg border border-border bg-surface-subtle/50 hover:bg-surface-subtle transition flex flex-col gap-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium text-text-primary line-clamp-1">
                          {task.title}
                        </span>
                        <StatusBadge status={task.status} size="xs" />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                        {task.project?.name ? (
                          <span className="flex items-center gap-1 truncate max-w-[150px]">
                            <FolderIcon className="w-3 h-3 shrink-0" />
                            {task.project.name}
                          </span>
                        ) : (
                          <span>General</span>
                        )}

                        <span className="capitalize text-text-secondary font-medium">
                          {task.priority || "Normal"} Priority
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Info Box */}
          <div className="bg-surface-subtle border border-border/80 rounded-xl p-3.5 text-xs text-text-secondary space-y-1.5">
            <p className="font-semibold text-text-primary flex items-center gap-1.5">
              💡 Standup Tip
            </p>
            <p className="text-[12px] leading-relaxed">
              When tasks are allocated and updated in the Tasks tab, they automatically populate here. You can click <strong>Copy Report</strong> to instantly paste your update into Slack, Teams, or WhatsApp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportsPage;
