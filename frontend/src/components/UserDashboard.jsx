import { useState, useEffect, useMemo, useCallback } from "react";
import api from "../services/api";
import useProjects from "../hooks/useProjects";
import useTasks from "../hooks/useTasks";
import { TaskDistribution } from "./dashboard/TaskDistribution";
import { UpcomingDeadlines } from "./dashboard/UpcomingDeadlines";
import ProjectWorkspace from "./projects/ProjectWorkspace";
import KanbanBoard from "./tasks/KanbanBoard";
import TaskList from "./tasks/TaskList";
import TaskDetailModal from "./tasks/TaskDetailModal";
import Alert from "./common/Alert";
import {
  FolderIcon,
  CheckSquareIcon,
} from "./common/Icons";
import { useAuth } from "../context/AuthContext";

export function UserDashboard({ user }) {
  const { user: authUser } = useAuth();
  const effectiveUser = user || authUser;
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [viewMode, setViewMode] = useState("kanban");
  const [taskScope, setTaskScope] = useState("all"); // "all" | "mine"
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);

  const {
    projects,
    fetchProjects,
    updateProject,
    deleteProject,
    addMember,
    removeMember,
    assignProjectHead,
    removeProjectHead,
  } = useProjects();

  const taskState = useTasks(effectiveUser, { limit: 50 });
  const { fetchTasks } = taskState;

  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const res = await api.get("/dashboard");
      setDashboardData(res.data);
    } catch (err) {
      setDashboardError(
        err.response?.data?.message || "Failed to load dashboard metrics.",
      );
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchProjects();
    fetchTasks();
  }, [fetchDashboard, fetchProjects, fetchTasks]);

  const handleUpdateTask = async (taskId, changes) => {
    const res = await taskState.updateTask(taskId, changes);
    if (res?.success !== false) {
      await fetchDashboard();
    }
    return res;
  };

  const handleDeleteTask = async (taskId) => {
    const res = await taskState.deleteTask(taskId);
    if (res?.success !== false) {
      await fetchDashboard();
    }
    return res;
  };

  const getEntityId = (entity) => {
    if (!entity) return "";
    if (typeof entity === "object") {
      return String(entity._id || entity.id || entity.userId || "").trim();
    }
    return String(entity).trim();
  };
  const userId = getEntityId(effectiveUser);
  const firstName = effectiveUser?.name ? effectiveUser.name.split(" ")[0] : "Member";

  // Real SaaS metrics
  const ownedProjectsCount = useMemo(() => {
    if (!userId) return 0;
    return projects.filter((p) => getEntityId(p.owner) === userId).length;
  }, [projects, userId]);

  const assignedProjectsCount = useMemo(() => {
    if (!userId) return 0;
    return projects.filter((p) =>
      p.members?.some((m) => getEntityId(m) === userId),
    ).length;
  }, [projects, userId]);

  const summary = dashboardData?.summary || {};
  const totalTasksCount = summary.totalTasks ?? taskState.total ?? 0;

  const byStatus = dashboardData?.taskStats?.byStatus || {};
  const inProgressTasksCount =
    (byStatus["in-progress"] || 0) +
    (byStatus.testing || 0) ||
    taskState.allTasks.filter((t) => t.status === "in-progress" || t.status === "testing").length;
  const completedTasksCount =
    (byStatus.completed || 0) +
    (byStatus.done || 0) ||
    taskState.allTasks.filter((t) => t.status === "completed" || t.status === "done").length;

  const overdueTasksCount = useMemo(() => {
    return taskState.allTasks.filter(
      (t) =>
        t.dueDate &&
        new Date(t.dueDate) < new Date() &&
        t.status !== "completed" &&
        t.status !== "done",
    ).length;
  }, [taskState.allTasks]);

  const completionRate =
    totalTasksCount > 0
      ? Math.round((completedTasksCount / totalTasksCount) * 100)
      : 0;

  const selectedProject = projects.find(
    (p) => getEntityId(p) === String(selectedProjectId),
  );

  const visibleDeliverables = useMemo(() => {
    if (taskScope !== "mine" || !userId) return taskState.allTasks;
    return taskState.allTasks.filter((t) => {
      const assignees = Array.isArray(t.assignedTo)
        ? t.assignedTo
        : t.assignedTo
          ? [t.assignedTo]
          : [];
      return assignees.some((u) => getEntityId(u) === userId);
    });
  }, [taskState.allTasks, taskScope, userId]);

  return (
    <div className="space-y-5">
      {/* If a project workspace was opened from dashboard */}
      {selectedProject ? (
        <ProjectWorkspace
          project={selectedProject}
          allTasks={taskState.allTasks}
          currentUser={effectiveUser}
          onBack={() => setSelectedProjectId(null)}
          onUpdateProject={updateProject}
          onDeleteProject={deleteProject}
          onTaskCreate={taskState.createTask}
          onTaskUpdate={handleUpdateTask}
          onTaskDelete={handleDeleteTask}
          onAddMember={addMember}
          onRemoveMember={removeMember}
          onAssignProjectHead={assignProjectHead}
          onRemoveProjectHead={removeProjectHead}
          onRefresh={fetchProjects}
        />
      ) : (
        <>
          {/* Welcome & Context Header */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-4 sm:p-5 transition-colors">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Employee Portal Active</span>
                </div>

                <h1 className="mt-1.5 text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Welcome back, {firstName}
                </h1>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Tracking {projects.length} accessible project teams and assigned work deliverables.
                </p>
              </div>

              {/* Progress Summary Pill */}
              <div className="flex items-center gap-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-3.5 py-1.5 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                    Completion
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {completionRate}%
                  </span>
                </div>
                <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-800" />
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                    Overdue
                  </span>
                  <span
                    className={`text-sm font-bold ${overdueTasksCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                      }`}
                  >
                    {overdueTasksCount}
                  </span>
                </div>
              </div>
            </div>

            {dashboardError && (
              <div className="mt-3">
                <Alert message={dashboardError} type="error" />
              </div>
            )}
          </section>

          {/* 6 Practical Enterprise Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-3.5 text-left">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block truncate">
                Projects Led
              </span>
              <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {dashboardLoading ? "..." : ownedProjectsCount}
              </div>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 block">Project lead</span>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-3.5 text-left">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block truncate">
                Team Workspaces
              </span>
              <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {dashboardLoading ? "..." : assignedProjectsCount}
              </div>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 block">Participant</span>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-3.5 text-left">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block truncate">
                Deliverables
              </span>
              <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {dashboardLoading ? "..." : totalTasksCount}
              </div>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 block">Assignments</span>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-3.5 text-left">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block truncate">
                In Progress
              </span>
              <div className="mt-1 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                {dashboardLoading ? "..." : inProgressTasksCount}
              </div>
              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mt-0.5 block">Underway</span>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-3.5 text-left">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block truncate">
                Completed
              </span>
              <div className="mt-1 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {dashboardLoading ? "..." : completedTasksCount}
              </div>
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5 block">{completionRate}% finished</span>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-3.5 text-left">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block truncate">
                Overdue
              </span>
              <div
                className={`mt-1 text-2xl font-bold tracking-tight ${overdueTasksCount > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-slate-900 dark:text-white"
                  }`}
              >
                {dashboardLoading ? "..." : overdueTasksCount}
              </div>
              <span
                className={`text-[11px] font-medium mt-0.5 block ${overdueTasksCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"
                  }`}
              >
                {overdueTasksCount > 0 ? "Action required" : "On schedule"}
              </span>
            </div>
          </div>

          {/* Practical Status Distribution & Upcoming Deadlines */}
          <div className="space-y-5">
            <TaskDistribution taskStats={dashboardData?.taskStats || {}} />
            <UpcomingDeadlines
              tasks={taskState.allTasks}
              onTaskClick={(t) => setSelectedTask(t)}
            />
          </div>

          {/* Quick Workspaces Section */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-4 sm:p-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <FolderIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Assigned Project Workspaces</span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Select a workspace to open its dedicated Kanban pipeline, task table, and team roster
                </p>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {projects.length} accessible
              </span>
            </div>

            {projects.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                You are not currently enrolled in any project workspaces.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((proj) => {
                  const pId = getEntityId(proj);
                  const isOwner = userId !== "" && getEntityId(proj.owner) === userId;
                  const isHead = userId !== "" && getEntityId(proj.projectHead) === userId;
                  const projTasks = taskState.allTasks.filter(
                    (t) => getEntityId(t.project) === pId,
                  );
                  const completed = projTasks.filter(
                    (t) => t.status === "completed" || t.status === "done",
                  ).length;
                  const pct =
                    projTasks.length > 0
                      ? Math.round((completed / projTasks.length) * 100)
                      : 0;

                  return (
                    <div
                      key={pId}
                      onClick={() => setSelectedProjectId(pId)}
                      className="group flex flex-col justify-between rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-3 hover:border-slate-300 dark:hover:border-slate-700 transition cursor-pointer text-left"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition truncate">
                            {proj.name}
                          </h4>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${isOwner
                              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50"
                              : isHead
                                ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/50"
                                : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                              }`}
                          >
                            {isOwner ? "Owner" : isHead ? "Project Head" : "Member"}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {proj.description || "No description"}
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400">
                          {completed}/{projTasks.length} tasks
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Task Pipeline Section */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckSquareIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    {taskScope === "mine" ? "My Assigned Deliverables" : "Project Deliverables"}
                  </span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Switch between project tasks or filter to tasks assigned to you
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter dashboard deliverables"
                  value={taskScope}
                  onChange={(e) => setTaskScope(e.target.value)}
                  className="h-8 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161B22] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                >
                  <option value="all">All project tasks</option>
                  <option value="mine">Assigned to me</option>
                </select>

                {/* View Switcher Tabs */}
                <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode("kanban")}
                    className={`rounded px-3 py-1 font-medium transition ${viewMode === "kanban"
                      ? "bg-white text-slate-900 shadow-xs dark:bg-[#161B22] dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      }`}
                  >
                    Kanban Board
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`rounded px-3 py-1 font-medium transition ${viewMode === "table"
                      ? "bg-white text-slate-900 shadow-xs dark:bg-[#161B22] dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      }`}
                  >
                    Table View
                  </button>
                </div>
              </div>
            </div>

            {viewMode === "kanban" ? (
              <KanbanBoard
                tasks={visibleDeliverables}
                projects={projects}
                user={user}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
                onClick={(t) => setSelectedTask(t)}
              />
            ) : (
              <TaskList
                tasks={visibleDeliverables}
                projects={projects}
                user={user}
                loading={taskState.loading}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
                onTaskClick={(t) => setSelectedTask(t)}
              />
            )}
          </section>
        </>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          isOpen={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          projects={projects}
          user={user}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}

export default UserDashboard;
