
import { useEffect, useState, useMemo, useCallback } from "react";
import useProjects from "../../hooks/useProjects";
import useTasks from "../../hooks/useTasks";
import TaskFilters from "../tasks/TaskFilters";
import TaskList from "../tasks/TaskList";
import CreateTaskModal from "../tasks/CreateTaskModal";
import TaskDetailModal from "../tasks/TaskDetailModal";
import Alert from "../common/Alert";
import Button from "../common/Button";
import { PlusIcon } from "../common/Icons";
import { useAuth } from "../../context/AuthContext";

export function TasksPage({ user }) {
  const {
    projects,
    error: projectError,
    fetchProjects,
  } = useProjects();

  const { user: authUser } = useAuth();
  const effectiveUser = user || authUser;

  const taskState = useTasks(effectiveUser, { limit: 100 });
  const { fetchTasks } = taskState;

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewMode, setViewMode] = useState("kanban");

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    const targetLimit = mode === "kanban" ? 100 : 10;

    if (taskState.limit !== targetLimit) {
      taskState.setLimit(targetLimit);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const getEntityId = (entity) => {
    if (!entity) return "";

    if (typeof entity === "object") {
      return String(entity._id || entity.id || entity.userId || "").trim();
    }

    return String(entity).trim();
  };

  const isSuperAdmin = effectiveUser?.role === "superadmin";
  const currentUserId = getEntityId(effectiveUser);

  const canUserCreateTaskInProject = useCallback(
    (project) => {
      if (!project || !effectiveUser) return false;
      if (isSuperAdmin) return true;
      if (!currentUserId) return false;

      const ownerId = getEntityId(project.owner);
      const headId = getEntityId(project.projectHead);

      const isOwner = ownerId !== "" && ownerId === currentUserId;
      const isHead = headId !== "" && headId === currentUserId;

      return isOwner || isHead;
    },
    [effectiveUser, isSuperAdmin, currentUserId],
  );

  const permittedProjectsForTaskCreation = useMemo(() => {
    if (!effectiveUser) return [];
    if (isSuperAdmin) return projects;

    return projects.filter((project) =>
      canUserCreateTaskInProject(project),
    );
  }, [
    projects,
    effectiveUser,
    isSuperAdmin,
    canUserCreateTaskInProject,
  ]);

  const activePermittedProjects = useMemo(() => {
    if (!taskState.projectFilter) {
      return permittedProjectsForTaskCreation;
    }

    return permittedProjectsForTaskCreation.filter(
      (project) =>
        getEntityId(project) === String(taskState.projectFilter),
    );
  }, [
    permittedProjectsForTaskCreation,
    taskState.projectFilter,
  ]);

  const canCreateTask = activePermittedProjects.length > 0;

  const handleOpenCreateModal = () => {
    if (!canCreateTask) return;
    setCreateModalOpen(true);
  };

  const handleCreateTasks = async (payloads) => {
    if (!canCreateTask) {
      return { success: false, error: "Unauthorized" };
    }

    const res = await taskState.createTasks(payloads);

    if (res?.success) {
      setCreateModalOpen(false);
    }

    return res;
  };

  return (
    <div className="space-y-5 text-left">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary font-heading">
            Tasks
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Track and manage tasks across projects and team members.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {projects.length > 0 && (
            <div className="relative">
              <select
                aria-label="Filter by project"
                value={taskState.projectFilter}
                onChange={(e) => taskState.setProjectFilter(e.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-text-secondary outline-none focus:border-brand cursor-pointer transition-colors shadow-subtle"
              >
                <option value="">All projects ({projects.length})</option>

                {projects.map((project) => {
                  const projectId = getEntityId(project);

                  return (
                    <option key={projectId} value={projectId}>
                      {project.name}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {canCreateTask && (
            <Button
              variant="primary"
              size="md"
              icon={PlusIcon}
              onClick={handleOpenCreateModal}
            >
              New task
            </Button>
          )}
        </div>
      </div>

      {projectError && (
        <Alert type="error" message={projectError} />
      )}

      {taskState.error && (
        <Alert type="error" message={taskState.error} />
      )}

      {taskState.success && (
        <Alert type="success" message={taskState.success} />
      )}

      <TaskFilters
        search={taskState.search}
        setSearch={taskState.setSearch}
        statusFilter={taskState.statusFilter}
        setStatusFilter={taskState.setStatusFilter}
        priorityFilter={taskState.priorityFilter}
        setPriorityFilter={taskState.setPriorityFilter}
        assigneeFilter={taskState.assigneeFilter}
        setAssigneeFilter={taskState.setAssigneeFilter}
        viewMode={viewMode}
        setViewMode={handleViewModeChange}
      />

      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5 shadow-subtle">
        <TaskList
          tasks={taskState.tasks}
          projects={projects}
          user={effectiveUser}
          page={taskState.page}
          totalPages={taskState.totalPages}
          total={taskState.total}
          limit={taskState.limit}
          loading={taskState.loading}
          onPageChange={taskState.setPage}
          onUpdate={taskState.updateTask}
          onDelete={taskState.deleteTask}
          onTaskClick={(task) => setSelectedTask(task)}
          viewMode={viewMode}
        />
      </div>

      {createModalOpen && canCreateTask && (
        <CreateTaskModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          projects={activePermittedProjects}
          user={effectiveUser}
          onSubmit={handleCreateTasks}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          isOpen={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          task={
            taskState.tasks.find(
              (task) =>
                String(task._id || task.id) ===
                String(selectedTask._id || selectedTask.id),
            ) || selectedTask
          }
          projects={projects}
          user={effectiveUser}
          onUpdate={taskState.updateTask}
          onDelete={taskState.deleteTask}
        />
      )}
    </div>
  );
}

export default TasksPage;
