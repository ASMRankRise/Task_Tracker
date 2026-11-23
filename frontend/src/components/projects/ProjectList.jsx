import { useState } from "react";
import { AvatarGroup } from "../common/Avatar";
import Modal from "../common/Modal";
import Alert from "../common/Alert";
import {
  FolderIcon,
  UsersIcon,
  EditIcon,
  TrashIcon,
  SearchIcon,
  ArrowRightIcon,
  CalendarIcon,
} from "../common/Icons";
import MemberManagementModal from "./MemberManagementModal";
import { useAuth } from "../../context/AuthContext";

export function ProjectList({
  projects = [],
  tasks = [],
  user,
  loading = false,
  onRefresh,
  onSelectProject,
  onUpdateProject,
  onDeleteProject,
  onAddMember,
  onRemoveMember,
  onAssignProjectHead,
  onRemoveProjectHead,
}) {
  const [search, setSearch] = useState("");
  const [editingProject, setEditingProject] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [updating, setUpdating] = useState(false);
  const [manageMembersProject, setManageMembersProject] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { user: authUser } = useAuth();
  const effectiveUser = user || authUser;
  const getEntityId = (entity) => {
    if (!entity) return "";
    if (typeof entity === "object") {
      return String(entity._id || entity.id || entity.userId || "").trim();
    }
    return String(entity).trim();
  };
  const getId = getEntityId;

  const isSuperAdmin = effectiveUser?.role === "superadmin";
  const isAdmin = effectiveUser?.role === "admin";
  const userId = getEntityId(effectiveUser);

  const isProjectOwner = (p) =>
    userId !== "" && getId(p?.owner) === userId;

  const isProjectHead = (p) =>
    userId !== "" && getId(p?.projectHead) === userId;


  const canManage = (p) => isSuperAdmin || isProjectOwner(p);

  // Filter projects by search
  const filteredProjects = projects.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.owner?.name?.toLowerCase().includes(q) ||
      p.owner?.email?.toLowerCase().includes(q)
    );
  });

  const handleEditClick = (e, p) => {
    e.stopPropagation();
    setEditingProject(p);
    setEditForm({
      name: p.name || "",
      description: p.description || "",
    });
    setError("");
    setSuccess("");
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingProject) return;

    setError("");
    setSuccess("");
    setUpdating(true);

    try {
      const pId = getId(editingProject);
      await onUpdateProject?.(pId, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
      });
      setSuccess("Project updated successfully.");
      setEditingProject(null);
      await onRefresh?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to update project.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-4 text-left">
      {/* Search Bar & Counter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-text-tertiary" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by name, description, owner..."
            className="h-9 w-full rounded-md border border-border bg-surface py-1.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors shadow-subtle"
          />
        </div>

        <div className="text-[13px] text-text-secondary">
          Showing <span className="font-semibold text-text-primary">{filteredProjects.length}</span> of{" "}
          <span className="font-semibold text-text-primary">{projects.length}</span> {projects.length === 1 ? "project" : "projects"}
        </div>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* Grid or Empty State */}
      {loading && projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-14 text-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="mt-2.5 text-sm text-text-secondary">Loading projects...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface p-10 text-center shadow-subtle">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-subtle text-text-secondary">
            <FolderIcon className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-text-primary">
            {search ? "No matching projects" : "No projects yet"}
          </h3>
          <p className="mt-1 max-w-sm text-[13px] text-text-secondary">
            {search
              ? "Try adjusting your search query."
              : "No projects yet. Create one to start adding tasks."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => {
            const pId = getId(project);
            const owner = project.owner;
            const members = Array.isArray(project.members) ? project.members : [];
            const canEdit = canManage(project);
            const isOwner = isProjectOwner(project);

            // Calculate task progress for this project
            const projTasks = tasks.filter((t) => String(getId(t.project)) === String(pId));
            const totalProjTasks = projTasks.length;
            const doneProjTasks = projTasks.filter(
              (t) => t.status === "completed" || t.status === "done"
            ).length;
            const progress = totalProjTasks > 0 ? Math.round((doneProjTasks / totalProjTasks) * 100) : 0;

            return (
              <article
                key={pId}
                onClick={() => onSelectProject?.(project)}
                className="group relative flex flex-col justify-between rounded-lg border border-border bg-surface p-4 shadow-subtle transition-colors hover:border-brand/40 hover:bg-surface-subtle/30 cursor-pointer text-left"
              >
                <div>
                  {/* Top Bar: Icon, Name & Badges */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-text-primary group-hover:text-brand transition-colors truncate font-heading">
                        {project.name}
                      </h3>
                      <p className="text-[12px] text-text-tertiary flex items-center gap-1.5 mt-0.5">
                        <CalendarIcon className="w-3.5 h-3.5 text-text-tertiary" />
                        <span>
                          {project.createdAt
                            ? new Date(project.createdAt).toLocaleDateString()
                            : "Active"}
                        </span>
                      </p>
                    </div>

                    {isOwner ? (
                      <span className="shrink-0 rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-text-secondary">
                        Owner
                      </span>
                    ) : isProjectHead(project) ? (
                      <span className="shrink-0 rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-brand border-brand/30">
                        Project Head
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-text-secondary">
                        Member
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-text-secondary min-h-[36px]">
                    {project.description || "No project description provided."}
                  </p>
                </div>

                {/* Progress & Team Details */}
                <div className="mt-4 border-t border-border-subtle pt-3 space-y-3">
                  {/* Progress Bar (Pine progress, Stone track) */}
                  <div>
                    <div className="flex items-center justify-between text-[12px] mb-1.5">
                      <span className="text-text-secondary font-medium">
                        {totalProjTasks > 0
                          ? `${doneProjTasks} of ${totalProjTasks} tasks done`
                          : "No tasks registered"}
                      </span>
                      <span className="font-mono text-xs font-semibold text-text-primary">{progress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-surface-subtle overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Team Roster & Lead */}
                  <div className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-1.5">
                      <AvatarGroup users={members} max={3} size="xs" />
                      <span className="text-text-secondary">
                        {members.length} {members.length === 1 ? "member" : "members"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-text-tertiary font-medium">Lead:</span>
                      <span className="font-medium text-text-primary truncate max-w-[100px]">
                        {owner?.name?.split(" ")[0] || owner?.email?.split("@")[0] || "User"}
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-subtle">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand group-hover:underline">
                      <span>Open project</span>
                      <ArrowRightIcon className="w-3.5 h-3.5" />
                    </span>

                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canEdit && (
                        <button
                          type="button"
                          onClick={(e) => handleEditClick(e, project)}
                          className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-subtle hover:text-text-primary transition-colors cursor-pointer"
                          title="Edit project"
                        >
                          <EditIcon className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {canEdit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setManageMembersProject(project);
                          }}
                          className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-subtle hover:text-text-primary transition-colors cursor-pointer"
                          title="Manage members"
                        >
                          <UsersIcon className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {canEdit && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const confirmed = window.confirm(
                              `Delete project "${project.name}" and all associated tasks?`
                            );
                            if (confirmed) {
                              await onDeleteProject?.(pId);
                            }
                          }}
                          className="rounded-md p-1.5 text-text-tertiary hover:bg-[#FEF2F2] hover:text-[#991B1B] dark:hover:bg-[#3B0D0D] dark:hover:text-[#F87171] transition-colors cursor-pointer"
                          title="Delete project"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <Modal
          isOpen={Boolean(editingProject)}
          onClose={() => setEditingProject(null)}
          title="Edit project"
          subtitle="Modify project title and description"
        >
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-text-secondary mb-1">
                Project name
              </label>
              <input
                type="text"
                required
                maxLength={50}
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors shadow-subtle"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-text-secondary mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-md border border-border bg-surface p-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors resize-none shadow-subtle"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="h-9 rounded-md border border-border bg-surface px-3.5 text-[13px] font-medium text-text-primary hover:bg-surface-subtle transition-colors shadow-subtle cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updating}
                className="h-9 rounded-md bg-brand hover:bg-brand-hover px-4 text-[13px] font-medium text-brand-text shadow-subtle transition-colors disabled:opacity-50 cursor-pointer"
              >
                {updating ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Member Management Modal */}
      {manageMembersProject && (
        <MemberManagementModal
          isOpen={Boolean(manageMembersProject)}
          onClose={() => setManageMembersProject(null)}
          project={manageMembersProject}
          currentUser={user}
          canManage={canManage(manageMembersProject)}
          onAddMember={onAddMember}
          onRemoveMember={onRemoveMember}
          canRemoveMember={canManage(manageMembersProject)}
          onAssignProjectHead={onAssignProjectHead}
          onRemoveProjectHead={onRemoveProjectHead}
        />
      )}
    </div>
  );
}

export default ProjectList;
