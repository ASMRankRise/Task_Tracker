
import { useState, useMemo } from "react";
import { Avatar, AvatarGroup } from "../common/Avatar";
import Button from "../common/Button";
import {
  CalendarIcon,
  TrashIcon,
  ArrowLeftIcon,
  KanbanIcon,
  TableIcon,
  UserPlusIcon,
  PlusIcon,
  UsersIcon,
} from "../common/Icons";
import KanbanBoard from "../tasks/KanbanBoard";
import CreateTaskModal from "../tasks/CreateTaskModal";
import TaskDetailModal from "../tasks/TaskDetailModal";
import TaskStatusDropdown from "../tasks/TaskStatusDropdown";
import TaskPriorityDropdown from "../tasks/TaskPriorityDropdown";
import MemberManagementModal from "./MemberManagementModal";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { getAssigneeDisplay, getTaskPermissions } from "../../utils/taskPermissions";

export function ProjectWorkspace({
  project,
  allTasks = [],
  currentUser,
  onBack,
  onUpdateProject,
  onDeleteProject,
  onTaskCreate,
  onTaskUpdate,
  onTaskDelete,
  onAddMember,
  onRemoveMember,
  onAssignProjectHead,
  onRemoveProjectHead,
  onRefresh,
}) {
  const { success, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState("tasks");
  const [taskViewMode, setTaskViewMode] = useState("board");
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const [editName, setEditName] = useState(project.name || "");
  const [editDescription, setEditDescription] = useState(project.description || "");
  const [savingSettings, setSavingSettings] = useState(false);

  const { user: authUser } = useAuth();
  const effectiveUser = currentUser || authUser;

  const getEntityId = (entity) => {
    if (!entity) return "";
    if (typeof entity === "object") {
      return String(entity._id || entity.id || entity.userId || "").trim();
    }
    return String(entity).trim();
  };

  const currentUserId = getEntityId(effectiveUser);
  const isSuperAdmin = effectiveUser?.role === "superadmin";
  const pId = getEntityId(project);
  const ownerId = getEntityId(project.owner);
  const headId = getEntityId(project.projectHead);

  const isOwner =
    currentUserId !== "" && ownerId !== "" && ownerId === currentUserId;

  const isProjectHead =
    currentUserId !== "" && headId !== "" && headId === currentUserId;

  const canManageProject = isSuperAdmin || isOwner;
  const canCreateTask = isSuperAdmin || isOwner || isProjectHead;

  const projectTasks = useMemo(() => {
    return allTasks.filter((t) => {
      const taskProjectId = getEntityId(t.project);
      return taskProjectId === pId;
    });
  }, [allTasks, pId]);

  const totalTasks = projectTasks.length;

  const completedTasks = projectTasks.filter(
    (t) => t.status === "completed" || t.status === "done"
  ).length;

  const inProgressTasks = projectTasks.filter(
    (t) => t.status === "in-progress" || t.status === "testing"
  ).length;

  const progressPercent =
    totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

  const members = Array.isArray(project.members) ? project.members : [];

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!canManageProject || savingSettings) return;

    if (!editName.trim()) {
      toastError("Project name is required");
      return;
    }

    if (editName.trim().length < 3 || editName.trim().length > 50) {
      toastError("Project name must be 3-50 characters");
      return;
    }

    setSavingSettings(true);
    const res = await onUpdateProject(pId, {
      name: editName.trim(),
      description: editDescription.trim(),
    });
    setSavingSettings(false);

    if (res?.success !== false) {
      success("Project settings saved");
      onRefresh?.();
    } else {
      toastError(res?.error || "Failed to update settings");
    }
  };

  const handleInlineAddMember = async (e) => {
    e.preventDefault();
    if (!canManageProject || addingMember || !newMemberEmail.trim()) return;

    setAddingMember(true);
    const res = await onAddMember(pId, newMemberEmail.trim());
    setAddingMember(false);

    if (res?.success !== false) {
      success(`Added ${newMemberEmail} to project`);
      setNewMemberEmail("");
      onRefresh?.();
    } else {
      toastError(res?.error || "Failed to add member");
    }
  };

  const handleInlineRemoveMember = async (memberId, memberName) => {
    if (!canManageProject) return;

    const confirmed = window.confirm(
      `Remove ${memberName} from this project?`
    );

    if (!confirmed) return;

    const res = await onRemoveMember(pId, memberId);

    if (res?.success !== false) {
      success("Member removed from project");
      onRefresh?.();
    } else {
      toastError(res?.error || "Failed to remove member");
    }
  };

  const handleInlineAssignHead = async (targetEmail) => {
    if (!canManageProject) return;

    const res = await onAssignProjectHead?.(pId, targetEmail);

    if (res?.success !== false) {
      success("Project Head assigned successfully");
      onRefresh?.();
    } else {
      toastError(res?.error || "Failed to assign Project Head");
    }
  };

  const handleInlineRemoveHead = async () => {
    if (!canManageProject) return;

    const res = await onRemoveProjectHead?.(pId);

    if (res?.success !== false) {
      success("Project Head removed successfully");
      onRefresh?.();
    } else {
      toastError(res?.error || "Failed to remove Project Head");
    }
  };

  const handleDeleteProject = async () => {
    if (!canManageProject) {
      toastError("Only the project owner or super admin can delete projects");
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete "${project.name}" and all associated tasks?`
    );

    if (!confirmed) return;

    const res = await onDeleteProject(pId);

    if (res?.success !== false) {
      success("Project deleted successfully");
      onBack();
    } else {
      toastError(res?.error || "Failed to delete project");
    }
  };

  return (
    <div className="space-y-5 text-left">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-9 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors shadow-subtle cursor-pointer"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span>Projects</span>
        </button>

        <div className="flex items-center gap-2.5">
          {canManageProject && (
            <Button
              variant="secondary"
              size="md"
              icon={UsersIcon}
              onClick={() => setMemberModalOpen(true)}
            >
              Add member
            </Button>
          )}

          {canCreateTask && (
            <Button
              variant="primary"
              size="md"
              icon={PlusIcon}
              onClick={() => setCreateTaskModalOpen(true)}
            >
              New task
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 shadow-subtle">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary font-heading">
                {project.name}
              </h1>

              {isOwner ? (
                <span className="rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-text-secondary">
                  Owner
                </span>
              ) : isProjectHead ? (
                <span className="rounded-md border border-brand/30 bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-brand">
                  Project Head
                </span>
              ) : (
                <span className="rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-text-secondary">
                  Member
                </span>
              )}
            </div>

            <p className="text-sm text-text-secondary leading-relaxed">
              {project.description || "No project description specified."}
            </p>

            <div className="flex items-center gap-4 text-[13px] text-text-tertiary flex-wrap pt-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-text-secondary">Lead:</span>
                <Avatar user={project.owner} size="xs" />
                <span className="font-medium text-text-primary">
                  {project.owner?.name || project.owner?.email || "Project lead"}
                </span>
              </div>

              {project.projectHead && (
                <>
                  <span>•</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-text-secondary">Head:</span>
                    <Avatar user={project.projectHead} size="xs" />
                    <span className="font-medium text-text-primary">
                      {project.projectHead?.name || project.projectHead?.email || "Project head"}
                    </span>
                  </div>
                </>
              )}

              <span>•</span>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-text-secondary">Team:</span>
                <AvatarGroup users={members} size="xs" max={4} />
                <span>{members.length} {members.length === 1 ? "member" : "members"}</span>
              </div>

              {project.createdAt && (
                <>
                  <span>•</span>
                  <span>
                    Created {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface-subtle/50 p-4 min-w-[220px] space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-text-secondary">Progress</span>
              <span className="font-mono font-semibold text-text-primary">
                {progressPercent}%
              </span>
            </div>

            <div className="h-2 w-full rounded-full bg-surface-subtle overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[12px] text-text-secondary pt-0.5">
              <span>{completedTasks} completed</span>
              <span>•</span>
              <span>{inProgressTasks} in progress</span>
              <span>•</span>
              <span>{totalTasks} total</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-6 border-b border-border overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={`pb-2.5 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-[1px] ${activeTab === "tasks"
              ? "border-brand text-text-primary font-semibold"
              : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
          >
            Tasks ({projectTasks.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("members")}
            className={`pb-2.5 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-[1px] ${activeTab === "members"
              ? "border-brand text-text-primary font-semibold"
              : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
          >
            Team ({members.length})
          </button>

          {canManageProject && (
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`pb-2.5 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-[1px] ${activeTab === "settings"
                ? "border-brand text-text-primary font-semibold"
                : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
            >
              Settings
            </button>
          )}
        </div>
      </div>

      {activeTab === "tasks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">
              Project tasks
            </h3>

            <div className="inline-flex rounded-md border border-border bg-surface-subtle p-0.5 text-[13px]">
              <button
                type="button"
                onClick={() => setTaskViewMode("board")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${taskViewMode === "board"
                  ? "bg-surface text-text-primary shadow-subtle"
                  : "text-text-secondary hover:text-text-primary"
                  }`}
              >
                <KanbanIcon className="h-3.5 w-3.5" />
                <span>Board</span>
              </button>

              <button
                type="button"
                onClick={() => setTaskViewMode("table")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${taskViewMode === "table"
                  ? "bg-surface text-text-primary shadow-subtle"
                  : "text-text-secondary hover:text-text-primary"
                  }`}
              >
                <TableIcon className="h-3.5 w-3.5" />
                <span>Table</span>
              </button>
            </div>
          </div>

          {projectTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface p-10 text-center shadow-subtle">
              <h3 className="text-sm font-semibold text-text-primary">
                No tasks in this project
              </h3>
              <p className="mt-1 text-[13px] text-text-secondary max-w-sm">
                Get started by creating tasks to assign work and track deliverables.
              </p>

              {canCreateTask && (
                <div className="mt-4">
                  <Button
                    variant="primary"
                    size="md"
                    icon={PlusIcon}
                    onClick={() => setCreateTaskModalOpen(true)}
                  >
                    New task
                  </Button>
                </div>
              )}
            </div>
          ) : taskViewMode === "board" ? (
            <KanbanBoard
              tasks={projectTasks}
              projects={[project]}
              user={effectiveUser}
              onUpdate={onTaskUpdate}
              onDelete={onTaskDelete}
              onClick={(task) => setSelectedTask(task)}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-subtle">
              <table className="w-full text-left text-sm text-text-primary">
                <thead className="border-b border-border bg-surface-subtle/70 text-[12px] font-semibold text-text-secondary">
                  <tr>
                    <th className="px-4 py-3">Task</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Assignees</th>
                    <th className="px-4 py-3">Due date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border-subtle">
                  {projectTasks.map((t) => {
                    const {
                      assignedUsers,
                      fullLabel: allWorkersLabel,
                    } = getAssigneeDisplay(t, project);

                    const {
                      canView,
                      canChangeStatus,
                      canChangePriority,
                      canDeleteTask,
                    } = getTaskPermissions(t, project, effectiveUser);

                    return (
                      <tr
                        key={t._id || t.id}
                        onClick={() => {
                          if (canView) {
                            setSelectedTask(t);
                          } else {
                            toastError(
                              "Members can only view task details for tasks assigned to them"
                            );
                          }
                        }}
                        className={`${canView
                          ? "hover:bg-surface-subtle/50 cursor-pointer"
                          : "opacity-85 cursor-default"
                          } transition-colors`}
                      >
                        <td className="px-4 py-3 max-w-[280px]">
                          <div className="font-medium text-text-primary truncate">
                            {t.title}
                          </div>
                          {t.description && (
                            <div className="text-[12px] text-text-secondary truncate mt-0.5">
                              {t.description}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <TaskStatusDropdown
                            status={t.status}
                            canEdit={canChangeStatus}
                            onUpdate={(newStatus) =>
                              onTaskUpdate?.(t._id || t.id, { status: newStatus })
                            }
                            size="xs"
                          />
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <TaskPriorityDropdown
                            priority={t.priority}
                            canEdit={canChangePriority}
                            onUpdate={(newPriority) =>
                              onTaskUpdate?.(t._id || t.id, { priority: newPriority })
                            }
                            size="xs"
                          />
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          {assignedUsers.length > 0 ? (
                            <div
                              className="flex items-center gap-2 max-w-[200px]"
                              title={allWorkersLabel}
                            >
                              <AvatarGroup users={assignedUsers} size="xs" max={3} />
                              <span className="truncate text-[13px] font-medium text-text-primary">
                                {allWorkersLabel}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[12px] text-text-tertiary">Unassigned</span>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-[12px] text-text-secondary">
                          {t.dueDate ? (
                            <span className="flex items-center gap-1.5">
                              <CalendarIcon className="w-3.5 h-3.5 text-text-tertiary" />
                              {new Date(t.dueDate).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          ) : (
                            <span className="text-text-tertiary">No deadline</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-2">
                            {canView ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTask(t);
                                }}
                                className="text-[13px] font-medium text-brand hover:underline cursor-pointer"
                              >
                                View
                              </button>
                            ) : (
                              <span className="text-[12px] text-text-tertiary italic">
                                Restricted
                              </span>
                            )}
                            {canDeleteTask && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Delete task "${t.title}"?`)) {
                                    onTaskDelete?.(t._id || t.id);
                                  }
                                }}
                                className="rounded p-1 text-text-tertiary hover:text-[#991B1B] hover:bg-[#FEF2F2] dark:hover:bg-[#3B0D0D] dark:hover:text-[#F87171] transition-colors cursor-pointer"
                                title="Delete task"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "members" && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4 shadow-subtle">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Team members
              </h3>
              <p className="text-[13px] text-text-secondary mt-0.5">
                Collaborators assigned to this project can view and manage tasks.
              </p>
            </div>

            {canManageProject && (
              <form
                onSubmit={handleInlineAddMember}
                className="flex items-center gap-2"
              >
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand w-56 shadow-subtle"
                />
                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  disabled={addingMember}
                  icon={UserPlusIcon}
                >
                  {addingMember ? "Adding..." : "Add"}
                </Button>
              </form>
            )}
          </div>

          <div className="divide-y divide-border-subtle border-t border-border mt-3">
            <div className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar user={project.owner} size="sm" />
                <div>
                  <div className="text-sm font-semibold text-text-primary">
                    {project.owner?.name || project.owner?.email || "Project lead"}
                  </div>
                  <div className="text-[12px] text-text-secondary">
                    {project.owner?.email}
                  </div>
                </div>
              </div>

              <span className="rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-text-secondary">
                Lead
              </span>
            </div>

            {members.map((m) => {
              const mId = getEntityId(m);
              const isCurrentUser = mId === currentUserId;

              return (
                <div
                  key={mId}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar user={m} size="sm" />
                    <div>
                      <div className="text-sm font-semibold text-text-primary flex items-center gap-2">
                        <span>{m.name || m.email}</span>
                        {isCurrentUser && (
                          <span className="text-[12px] font-medium text-brand">
                            (You)
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-text-secondary">
                        {m.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {mId === headId ? (
                      <span className="rounded-md border border-brand/30 bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-brand">
                        Project Head
                      </span>
                    ) : (
                      <span className="rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-text-secondary">
                        Member
                      </span>
                    )}

                    {canManageProject && (
                      <>
                        {mId === headId ? (
                          <button
                            type="button"
                            onClick={handleInlineRemoveHead}
                            className="text-[12px] font-medium text-text-secondary hover:underline p-1 cursor-pointer"
                            title="Remove as Project Head"
                          >
                            Remove Head
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleInlineAssignHead(m.email)}
                            className="text-[12px] font-medium text-brand hover:underline p-1 cursor-pointer"
                            title="Assign as Project Head"
                          >
                            Make Head
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            handleInlineRemoveMember(mId, m.name || m.email)
                          }
                          className="text-[13px] font-medium text-[#991B1B] dark:text-[#F87171] hover:underline p-1 transition cursor-pointer"
                          title="Remove member"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {members.length === 0 && (
              <div className="py-8 text-center text-sm text-text-secondary">
                No team members added yet. Add members to collaborate on tasks.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "settings" && canManageProject && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-6 shadow-subtle">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Project settings
            </h3>
            <p className="text-[13px] text-text-secondary mt-0.5">
              Update project details or manage project lifecycle.
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-[13px] font-medium text-text-secondary mb-1">
                Project name *
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
                required
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors shadow-subtle"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-text-secondary mb-1">
                Description
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full rounded-md border border-border bg-surface p-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors resize-none shadow-subtle"
              />
            </div>

            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={savingSettings}
            >
              {savingSettings ? "Saving..." : "Save settings"}
            </Button>
          </form>

          <div className="pt-5 border-t border-border">
            <h4 className="text-sm font-semibold text-[#991B1B] dark:text-[#F87171]">
              Danger zone
            </h4>
            <p className="mt-1 text-[13px] text-text-secondary">
              Permanently delete this project along with all associated tasks. This action cannot be undone.
            </p>
            <button
              type="button"
              onClick={handleDeleteProject}
              className="mt-3 h-9 inline-flex items-center gap-1.5 rounded-md border border-[#FECACA] dark:border-[#681D1D] bg-[#FEF2F2] dark:bg-[#3B0D0D] px-3.5 text-[13px] font-medium text-[#991B1B] dark:text-[#F87171] hover:bg-[#FEE2E2] transition-colors cursor-pointer"
            >
              <TrashIcon className="w-4 h-4" />
              <span>Delete project</span>
            </button>
          </div>
        </div>
      )}

      {createTaskModalOpen && canCreateTask && (
        <CreateTaskModal
          isOpen={createTaskModalOpen && canCreateTask}
          onClose={() => setCreateTaskModalOpen(false)}
          projects={[project]}
          user={effectiveUser}
          onSubmit={async (payloads) => {
            const res = await onTaskCreate?.(payloads);
            if (res?.success !== false) {
              setCreateTaskModalOpen(false);
            }
            return res;
          }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          isOpen={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          task={
            projectTasks.find(
              (t) => getEntityId(t) === getEntityId(selectedTask)
            ) || selectedTask
          }
          projects={[project]}
          user={effectiveUser}
          onUpdate={onTaskUpdate}
          onDelete={onTaskDelete}
        />
      )}

      <MemberManagementModal
        isOpen={memberModalOpen}
        onClose={() => setMemberModalOpen(false)}
        project={project}
        currentUser={effectiveUser}
        canManage={canManageProject}
        canRemoveMember={canManageProject}
        onAddMember={onAddMember}
        onRemoveMember={onRemoveMember}
        onAssignProjectHead={onAssignProjectHead}
        onRemoveProjectHead={onRemoveProjectHead}
      />
    </div>
  );
}

export default ProjectWorkspace;
