
import { useEffect, useRef, useState } from "react";
import Modal from "../common/Modal";
import Alert from "../common/Alert";
import { PlusIcon } from "../common/Icons";
import { useAuth } from "../../context/AuthContext";

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createTaskDraft(id, projectId = "") {
  return {
    id,
    title: "",
    description: "",
    project: projectId,
    status: "todo",
    priority: "low",
    assignedTo: "",
    dueDate: getTodayDate(),
    error: "",
  };
}

function getEntityId(entity) {
  if (!entity) return "";
  if (typeof entity === "object") {
    return String(entity._id || entity.id || entity.userId || "").trim();
  }
  return String(entity).trim();
}

export function CreateTaskModal({
  isOpen,
  onClose,
  projects = [],
  user,
  currentUser,
  onSubmit,
  onCreate,
  loading = false,
}) {
  const submitAction = onSubmit || onCreate;
  const { user: authUser } = useAuth();
  const effectiveUser = user || currentUser || authUser;

  const nextId = useRef(1);
  const wasOpenRef = useRef(false);

  const [tasks, setTasks] = useState(() => [
    createTaskDraft("task-1", projects.length === 1 ? getEntityId(projects[0]) : ""),
  ]);
  const [activeTask, setActiveTask] = useState("task-1");
  const [validationError, setValidationError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentUserId = getEntityId(effectiveUser);
  const isSuperAdmin = effectiveUser?.role === "superadmin";

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      nextId.current = 1;
      setTasks([
        createTaskDraft("task-1", projects.length === 1 ? getEntityId(projects[0]) : ""),
      ]);
      setActiveTask("task-1");
      setValidationError("");
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, projects]);

  useEffect(() => {
    setTasks((previous) =>
      previous.map((task) => {
        if (
          task.project &&
          !projects.some((project) => getEntityId(project) === task.project)
        ) {
          return { ...task, project: "", assignedTo: "" };
        }

        if (!task.project && projects.length === 1) {
          return { ...task, project: getEntityId(projects[0]) };
        }

        return task;
      }),
    );
  }, [projects]);

  const updateTask = (taskId, changes) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === taskId ? { ...task, ...changes, error: "" } : task,
      ),
    );
  };

  const addTask = () => {
    const id = `task-${++nextId.current}`;
    const newTask = createTaskDraft(
      id,
      projects.length === 1 ? getEntityId(projects[0]) : "",
    );

    setTasks((previous) => [...previous, newTask]);
    setActiveTask(id);
    setValidationError("");
  };

  const removeTask = (taskId) => {
    if (tasks.length === 1) return;

    const remaining = tasks.filter((task) => task.id !== taskId);
    setTasks(remaining);

    if (activeTask === taskId) {
      setActiveTask(remaining[remaining.length - 1].id);
    }
  };

  const getTaskDetails = (task) => {
    const selectedProject = projects.find(
      (item) => getEntityId(item) === String(task.project),
    );

    const ownerId = getEntityId(selectedProject?.owner);
    const headId = getEntityId(selectedProject?.projectHead);

    const isOwner =
      currentUserId !== "" &&
      ownerId !== "" &&
      ownerId === currentUserId;

    const isProjectHead =
      currentUserId !== "" &&
      headId === currentUserId &&
      !isSuperAdmin &&
      !isOwner;

    const canCreate = Boolean(
      selectedProject && (isSuperAdmin || isOwner || isProjectHead),
    );

    const projectMembers = [
      ...(selectedProject?.owner ? [selectedProject.owner] : []),
      ...(selectedProject?.projectHead ? [selectedProject.projectHead] : []),
      ...(selectedProject?.members || []),
    ].filter(
      (member, index, members) =>
        member?.email &&
        members.findIndex(
          (item) => item.email?.toLowerCase() === member.email.toLowerCase(),
        ) === index,
    );

    return { projectMembers, canCreate };
  };

  const validateTask = (task, index = 0) => {
    const { projectMembers, canCreate } = getTaskDetails(task);
    const prefix = tasks.length > 1 ? `Task ${index + 1}: ` : "";

    if (!task.title || !task.title.trim()) return `${prefix}Task title is required.`;
    if (task.title.trim().length > 150) {
      return `${prefix}Task title cannot exceed 150 characters.`;
    }
    if (task.description && task.description.trim().length > 1000) {
      return `${prefix}Description cannot exceed 1000 characters.`;
    }
    if (!task.project) return `${prefix}Please select a project.`;
    if (!canCreate) {
      return `${prefix}You do not have permission to create tasks in this project.`;
    }
    if (!task.assignedTo) {
      return `${prefix}Please select at least one task assignee.`;
    }
    if (
      task.assignedTo !== "ALL" &&
      !projectMembers.some((member) => member.email === task.assignedTo)
    ) {
      return `${prefix}Please select a valid project member.`;
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setValidationError("");

    if (!submitAction || loading || submitting) return;

    const validatedTasks = tasks.map((task, index) => ({
      ...task,
      error: validateTask(task, index),
    }));

    setTasks(validatedTasks);

    const firstInvalid = validatedTasks.find((task) => task.error);

    if (firstInvalid) {
      setActiveTask(firstInvalid.id);
      setValidationError(firstInvalid.error);
      return;
    }

    const payloads = validatedTasks.map((task) => ({
      title: task.title.trim(),
      description: task.description.trim(),
      priority: task.priority,
      status: task.status,
      project: task.project,
      ...(task.assignedTo === "ALL"
        ? { assignToAll: true }
        : { assignedTo: [task.assignedTo] }),
      ...(task.dueDate ? { dueDate: task.dueDate } : {}),
    }));

    setSubmitting(true);

    try {
      const result = await submitAction(payloads);

      if (result?.success) {
        onClose?.();
        return;
      }

      if (Array.isArray(result?.results)) {
        const failedTasks = tasks
          .map((task, index) => ({
            ...task,
            error: result.results[index]?.success
              ? ""
              : result.results[index]?.error || "Failed to create task.",
          }))
          .filter((task) => task.error);

        if (failedTasks.length > 0) {
          setTasks(failedTasks);
          setActiveTask(failedTasks[0].id);
          setValidationError(
            `${tasks.length - failedTasks.length} task(s) created successfully. Please check the failed tasks.`,
          );
        }
      } else {
        setValidationError(result?.error || "Failed to create tasks.");
      }
    } catch (error) {
      setValidationError(
        error.response?.data?.message || "Failed to create tasks.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = loading || submitting;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create multiple tasks"
      subtitle="Add work items, set deadlines, and assign team members."
      size="lg"
    >
      {projects.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-subtle p-4 text-center text-sm text-text-secondary">
          <p className="font-medium text-text-primary">
            No active projects available.
          </p>
          <p className="mt-1 text-[13px]">
            Please create or join a project first before creating tasks.
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[76vh] flex-col text-left"
        >
          {validationError && (
            <div className="mb-3 shrink-0">
              <Alert message={validationError} type="error" />
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-1">
            {tasks.map((task, index) => {
              const isOpen = activeTask === task.id;
              const { projectMembers } = getTaskDetails(task);

              return (
                <div
                  key={task.id}
                  className={`overflow-hidden rounded-lg border transition-colors ${isOpen
                    ? "border-brand/50 bg-surface shadow-subtle"
                    : "border-border bg-surface"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveTask(isOpen ? "" : task.id)
                      }
                      className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-subtle"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-subtle text-xs font-semibold text-text-secondary">
                        {index + 1}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-text-primary">
                          Task {index + 1}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-text-secondary">
                          {task.title.trim() || "Untitled task"}
                        </span>
                      </span>

                      <span className="text-sm text-text-secondary">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>

                    {tasks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTask(task.id)}
                        disabled={isBusy}
                        title="Remove task"
                        aria-label={`Remove task ${index + 1}`}
                        className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <div className="space-y-3.5 border-t border-border p-3.5">
                      {task.error && (
                        <Alert message={task.error} type="error" />
                      )}

                      <div>
                        <label className="mb-1 block text-xs font-medium text-text-secondary">
                          Project <span className="text-accent">*</span>
                        </label>
                        <select
                          value={task.project}
                          onChange={(event) =>
                            updateTask(task.id, {
                              project: event.target.value,
                              assignedTo: "",
                            })
                          }
                          required
                          disabled={isBusy}
                          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] text-text-primary outline-none focus:border-brand"
                        >
                          <option value="">Select project...</option>
                          {projects.map((project) => (
                            <option
                              key={getEntityId(project)}
                              value={getEntityId(project)}
                            >
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-text-secondary">
                          Task title <span className="text-accent">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={150}
                          value={task.title}
                          onChange={(event) =>
                            updateTask(task.id, { title: event.target.value })
                          }
                          placeholder="e.g. Implement user permission checks"
                          disabled={isBusy}
                          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] text-text-primary outline-none focus:border-brand"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-text-secondary">
                          Description
                          <span className="ml-1 font-normal text-text-tertiary">
                            (optional)
                          </span>
                        </label>
                        <textarea
                          rows={2}
                          maxLength={1000}
                          value={task.description}
                          onChange={(event) =>
                            updateTask(task.id, {
                              description: event.target.value,
                            })
                          }
                          placeholder="Provide delivery context or technical details..."
                          disabled={isBusy}
                          className="w-full resize-none rounded-md border border-border bg-surface p-2.5 text-[13px] text-text-primary outline-none focus:border-brand"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-text-secondary">
                            Status
                          </label>
                          <select
                            value={task.status}
                            onChange={(event) =>
                              updateTask(task.id, {
                                status: event.target.value,
                              })
                            }
                            disabled={isBusy}
                            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] text-text-primary"
                          >
                            <option value="todo">To do</option>
                            <option value="in-progress">In Progress</option>
                            <option value="testing">Testing</option>
                            <option value="completed">Completed</option>
                            <option value="done">Done</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-text-secondary">
                            Priority
                          </label>
                          <select
                            value={task.priority}
                            onChange={(event) =>
                              updateTask(task.id, {
                                priority: event.target.value,
                              })
                            }
                            disabled={isBusy}
                            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] text-text-primary"
                          >
                            <option value="low">Low priority</option>
                            <option value="medium">Medium priority</option>
                            <option value="high">High priority</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-text-secondary">
                          Assigned team member{" "}
                          <span className="text-accent">*</span>
                        </label>
                        <select
                          value={task.assignedTo}
                          onChange={(event) =>
                            updateTask(task.id, {
                              assignedTo: event.target.value,
                            })
                          }
                          disabled={!task.project || isBusy}
                          required
                          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] text-text-primary disabled:opacity-50"
                        >
                          <option value="">
                            {task.project
                              ? "Select assignee..."
                              : "Choose a project first..."}
                          </option>

                          {projectMembers.length > 1 && (
                            <option value="ALL">
                              All project members ({projectMembers.length})
                            </option>
                          )}

                          {projectMembers.map((member) => (
                            <option
                              key={member._id || member.email}
                              value={member.email}
                            >
                              {member.name || member.email} ({member.email})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-text-secondary">
                          Due date
                        </label>
                        <input
                          type="date"
                          value={task.dueDate}
                          onChange={(event) =>
                            updateTask(task.id, {
                              dueDate: event.target.value,
                            })
                          }
                          disabled={isBusy}
                          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] text-text-primary"
                        />
                      </div>

                      <div className="flex items-center justify-between border-t border-border pt-3">
                        <span className="text-[11px] text-text-tertiary">
                          Task {index + 1} of {tasks.length}
                        </span>

                        <button
                          type="button"
                          onClick={addTask}
                          disabled={isBusy}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-text-secondary transition-colors hover:border-brand/40 hover:bg-surface-subtle hover:text-text-primary disabled:opacity-50"
                        >
                          <PlusIcon className="h-3.5 w-3.5" />
                          Add another task
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t border-border bg-surface pt-3">
            <span className="text-xs text-text-tertiary">
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isBusy}
                className="h-9 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-subtle disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3.5 text-[13px] font-medium text-brand-text shadow-subtle transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-text border-t-transparent" />
                    Creating...
                  </>
                ) : (
                  <>
                    <PlusIcon className="h-3.5 w-3.5" />
                    {tasks.length > 1
                      ? `Create All Tasks (${tasks.length})`
                      : "Create Task"}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default CreateTaskModal;
