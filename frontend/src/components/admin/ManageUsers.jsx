import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { Avatar } from "../common/Avatar";
import { RoleBadge } from "../common/Badge";
import Alert from "../common/Alert";
import Modal from "../common/Modal";
import {
  SearchIcon,
  RotateCwIcon,
  TableIcon,
  GridIcon,
  MailIcon,
  CalendarIcon,
  CopyIcon,
  CheckCircleIcon,
  UserIcon,
  PlusIcon,
  LockIcon,
} from "../common/Icons";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

export function ManageUsers() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === "superadmin";

  const { success: toastSuccess, error: toastError } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingEmail, setUpdatingEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [viewMode, setViewMode] = useState("table"); // "table" | "cards"
  const [selectedUser, setSelectedUser] = useState(null);
  const [copiedEmail, setCopiedEmail] = useState("");

  // Create User modal state (Super Admin only)
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [createError, setCreateError] = useState("");

  // Reset Password modal state (Super Admin only)
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetError, setResetError] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.get("/admin/users");
      setUsers(Array.isArray(response.data?.users) ? response.data.users : []);
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || "Failed to fetch team members.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (email, newRole) => {
    if (!isSuperAdmin) {
      toastError("Only Super Admin can change user roles.");
      return;
    }

    const targetUser = users.find((user) => user.email === email);
    if (!targetUser) return;

    if (targetUser.role === "superadmin") {
      toastError("Super Admin accounts cannot be modified.");
      return;
    }

    if (targetUser.email === currentUser?.email) {
      toastError("You cannot modify your own role.");
      return;
    }

    if (!["admin", "user"].includes(newRole)) {
      toastError("Invalid role selected. Only Admin or Employee can be assigned.");
      return;
    }

    if (targetUser.role === newRole) return;

    setError("");
    setSuccess("");
    setUpdatingEmail(email);

    try {
      const response = await api.patch("/admin/users/role", {
        email,
        role: newRole,
      });

      const updatedRole = response.data.user?.role;
      if (!updatedRole) {
        throw new Error("The server did not return the updated role.");
      }

      setUsers((currentUsers) =>
        currentUsers.map((u) =>
          u.email === email ? { ...u, role: updatedRole } : u,
        ),
      );

      // If this user is open in modal, update modal state
      if (selectedUser && selectedUser.email === email) {
        setSelectedUser((prev) => ({ ...prev, role: updatedRole }));
      }

      const msg = `${targetUser.name || email}'s role was updated to ${
        updatedRole === "admin" ? "Administrator" : "Employee"
      }.`;
      setSuccess(msg);
      toastSuccess(msg);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Could not update user role.";
      setError(msg);
      toastError(msg);
      await fetchUsers();
    } finally {
      setUpdatingEmail("");
    }
  };

  const handleCopyEmail = (email) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    toastSuccess("Email copied to clipboard");
    setTimeout(() => setCopiedEmail(""), 2000);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateError("");

    if (!newUserData.name.trim()) {
      setCreateError("Full name is required.");
      return;
    }

    if (!newUserData.email.trim()) {
      setCreateError("Email is required.");
      return;
    }

    if (!newUserData.password || newUserData.password.length < 6) {
      setCreateError("Password must be at least 6 characters.");
      return;
    }

    setCreatingUser(true);
    try {
      await api.post("/admin/users", {
        name: newUserData.name.trim(),
        email: newUserData.email.trim().toLowerCase(),
        password: newUserData.password,
        role: newUserData.role,
      });

      toastSuccess(`Account created for ${newUserData.name.trim()}`);
      setCreateUserModalOpen(false);
      setNewUserData({ name: "", email: "", password: "", role: "user" });
      await fetchUsers();
    } catch (err) {
      setCreateError(
        err.response?.data?.message || err.message || "Failed to create user account.",
      );
    } finally {
      setCreatingUser(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError("");

    if (!newPasswordValue || newPasswordValue.length < 6) {
      setResetError("New password must be at least 6 characters.");
      return;
    }

    setResettingPassword(true);
    try {
      await api.post("/admin/users/reset-password", {
        email: resetTargetUser.email,
        newPassword: newPasswordValue,
      });

      toastSuccess(`Password reset successfully for ${resetTargetUser.name || resetTargetUser.email}`);
      setResetPasswordModalOpen(false);
      setResetTargetUser(null);
      setNewPasswordValue("");
    } catch (err) {
      setResetError(
        err.response?.data?.message || err.message || "Failed to reset password.",
      );
    } finally {
      setResettingPassword(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q);
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const superAdminCount = users.filter((u) => u.role === "superadmin").length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const employeeCount = users.filter((u) => u.role === "user").length;

  return (
    <div className="space-y-4 text-left">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary font-heading">
            Team
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Members and their roles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => {
                setNewUserData({ name: "", email: "", password: "", role: "user" });
                setCreateError("");
                setCreateUserModalOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand hover:bg-brand-hover text-brand-text px-3 text-[13px] font-medium shadow-subtle transition-colors cursor-pointer"
            >
              <PlusIcon className="h-4 w-4" />
              <span>Add Member</span>
            </button>
          )}

          {/* View Mode Toggle */}
          <div className="inline-flex rounded-md border border-border bg-surface-subtle p-0.5 text-[13px]">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              title="Table view"
              className={`rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                viewMode === "table"
                  ? "bg-surface text-text-primary shadow-subtle"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              title="Cards view"
              className={`rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                viewMode === "cards"
                  ? "bg-surface text-text-primary shadow-subtle"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <GridIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={fetchUsers}
            disabled={loading || Boolean(updatingEmail)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors disabled:opacity-50 cursor-pointer shadow-subtle"
          >
            <RotateCwIcon
              className={`h-4 w-4 text-text-secondary ${loading ? "animate-spin" : ""}`}
            />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {error && <Alert message={error} type="error" />}
      {success && <Alert message={success} type="success" />}

      {/* Summary Line (replaces the 3 stat cards) */}
      <div className="text-[13px] text-text-secondary font-medium">
        {users.length} members · {superAdminCount} {superAdminCount === 1 ? "Super Admin" : "Super Admins"} · {adminCount} {adminCount === 1 ? "Admin" : "Admins"} · {employeeCount} {employeeCount === 1 ? "Employee" : "Employees"}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-surface p-3 shadow-subtle">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-text-tertiary" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members by name or email..."
            className="h-9 w-full rounded-md border border-border bg-surface py-1 pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand focus:ring-1 focus:ring-brand transition-colors shadow-subtle"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-text-secondary outline-none focus:border-brand transition-colors cursor-pointer shadow-subtle"
          >
            <option value="">All roles ({users.length})</option>
            {superAdminCount > 0 && (
              <option value="superadmin">Super Admins ({superAdminCount})</option>
            )}
            <option value="admin">Administrators ({adminCount})</option>
            <option value="user">Employees ({employeeCount})</option>
          </select>

          <span className="text-[13px] text-text-secondary whitespace-nowrap">
            Showing {filteredUsers.length} of {users.length}
          </span>
        </div>
      </div>

      {/* Member List Presentation */}
      {loading && users.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center text-sm text-text-secondary shadow-subtle">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="mt-2.5 font-medium">Loading team members...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-sm text-text-secondary shadow-subtle">
          <UserIcon className="mx-auto h-8 w-8 text-text-tertiary mb-2 opacity-60" />
          <p className="font-semibold text-text-primary">No members found</p>
          <p className="mt-0.5 text-[13px]">Try adjusting your search query or role filter.</p>
        </div>
      ) : viewMode === "table" ? (
        /* TABLE VIEW */
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-subtle">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-text-primary">
              <thead className="border-b border-border bg-surface-subtle/70 text-[13px] font-semibold text-text-secondary">
                <tr>
                  <th scope="col" className="py-3 pl-4 pr-3">Member</th>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="px-4 py-3">Joined</th>
                  <th scope="col" className="py-3 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredUsers.map((u) => {
                  const isUpdating = updatingEmail === u.email;
                  const formattedDate = u.createdAt
                    ? new Date(u.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "—";

                  const canChangeRole =
                    isSuperAdmin &&
                    u.role !== "superadmin" &&
                    u.email !== currentUser?.email;

                  return (
                    <tr
                      key={u._id}
                      className="group transition-colors hover:bg-surface-subtle/50"
                    >
                      {/* Name & Email with Copy on Hover */}
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <Avatar user={u} size="md" />
                          <div className="min-w-0">
                            <p className="font-semibold text-text-primary truncate text-sm">
                              {u.name}
                            </p>
                            <div className="flex items-center gap-1.5 text-text-secondary text-[12px] mt-0.5">
                              <span className="truncate">{u.email}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyEmail(u.email)}
                                title="Copy email"
                                className="text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-0.5 cursor-pointer"
                              >
                                {copiedEmail === u.email ? (
                                  <CheckCircleIcon className="h-3.5 w-3.5 text-done" />
                                ) : (
                                  <CopyIcon className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Column (Single Control) */}
                      <td className="px-4 py-3">
                        {canChangeRole ? (
                          <select
                            aria-label={`Role selector for ${u.email}`}
                            value={u.role}
                            disabled={loading || isUpdating}
                            onChange={(e) => handleRoleChange(u.email, e.target.value)}
                            className="h-8 rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-text-primary outline-none focus:border-brand transition-colors cursor-pointer disabled:opacity-50 shadow-subtle"
                          >
                            <option value="user">Employee</option>
                            <option value="admin">Administrator</option>
                          </select>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <RoleBadge role={u.role} size="xs" />
                            {u.email === currentUser?.email && (
                              <span className="text-[12px] text-text-tertiary italic">(You)</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Joined Date */}
                      <td className="px-4 py-3 text-text-secondary text-[13px]">
                        {formattedDate}
                      </td>

                      {/* Actions Column */}
                      <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          {isSuperAdmin && u.role !== "superadmin" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setResetTargetUser(u);
                                setNewPasswordValue("");
                                setResetError("");
                                setResetPasswordModalOpen(true);
                              }}
                              className="text-[12px] font-medium text-text-secondary hover:text-text-primary hover:underline cursor-pointer"
                              title="Reset user password"
                            >
                              Reset password
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedUser(u)}
                            className="text-[13px] font-medium text-brand hover:underline cursor-pointer"
                          >
                            View details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredUsers.map((u) => {
            const isUpdating = updatingEmail === u.email;
            const formattedDate = u.createdAt
              ? new Date(u.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "—";

            const canChangeRole =
              isSuperAdmin &&
              u.role !== "superadmin" &&
              u.email !== currentUser?.email;

            return (
              <div
                key={u._id}
                className="group flex flex-col justify-between rounded-lg border border-border bg-surface p-4 hover:border-brand/40 transition-colors shadow-subtle text-left"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Avatar user={u} size="lg" />
                    <RoleBadge role={u.role} size="xs" />
                  </div>

                  <div className="mt-3">
                    <h3 className="font-semibold text-text-primary text-sm truncate">
                      {u.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-text-secondary">
                      <MailIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                      <span className="truncate">{u.email}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyEmail(u.email);
                        }}
                        title="Copy email"
                        className="text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-0.5 cursor-pointer"
                      >
                        {copiedEmail === u.email ? (
                          <CheckCircleIcon className="h-3.5 w-3.5 text-done" />
                        ) : (
                          <CopyIcon className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 text-[12px] text-text-tertiary">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      <span>Joined {formattedDate}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between gap-2">
                  {canChangeRole ? (
                    <select
                      aria-label={`Role selector for ${u.email}`}
                      value={u.role}
                      disabled={loading || isUpdating}
                      onChange={(e) => handleRoleChange(u.email, e.target.value)}
                      className="h-8 rounded-md border border-border bg-surface px-2 text-[12px] font-medium text-text-primary outline-none focus:border-brand transition-colors cursor-pointer disabled:opacity-50 shadow-subtle"
                    >
                      <option value="user">Employee</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className="text-[12px] text-text-tertiary">
                      {u.email === currentUser?.email ? "Your account" : "Protected"}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedUser(u)}
                    className="text-[13px] font-medium text-brand hover:underline cursor-pointer"
                  >
                    View details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Member Details Modal */}
      {selectedUser && (
        <Modal
          isOpen={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          title="Member details"
          subtitle="Account record and access privileges"
          size="md"
        >
          <div className="space-y-4 text-left">
            {/* Profile Overview */}
            <div className="flex items-center gap-3.5 rounded-lg border border-border bg-surface-subtle/50 p-4">
              <Avatar user={selectedUser} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-text-primary truncate">
                    {selectedUser.name}
                  </h3>
                  <RoleBadge role={selectedUser.role} size="xs" />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[13px] text-text-secondary">
                  <span className="truncate">{selectedUser.email}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyEmail(selectedUser.email)}
                    title="Copy email"
                    className="text-text-tertiary hover:text-text-primary cursor-pointer"
                  >
                    {copiedEmail === selectedUser.email ? (
                      <CheckCircleIcon className="h-3.5 w-3.5 text-done" />
                    ) : (
                      <CopyIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Account Details */}
            <div className="space-y-2.5 rounded-lg border border-border p-3.5">
              <h4 className="text-[12px] font-semibold text-text-secondary">
                Account information
              </h4>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-text-tertiary block text-[12px]">Account ID</span>
                  <span className="font-mono text-[12px] text-text-primary truncate block mt-0.5">
                    {selectedUser._id}
                  </span>
                </div>

                <div>
                  <span className="text-text-tertiary block text-[12px]">Joined date</span>
                  <span className="text-text-primary font-medium block mt-0.5 text-[13px]">
                    {selectedUser.createdAt
                      ? new Date(selectedUser.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "Not available"}
                  </span>
                </div>
              </div>
            </div>

            {/* Privilege & Role Governance */}
            <div className="space-y-2.5 rounded-lg border border-border p-3.5">
              <div>
                <h4 className="text-[12px] font-semibold text-text-secondary">
                  Access permissions
                </h4>
                <p className="mt-1 text-[13px] text-text-secondary leading-relaxed">
                  {selectedUser.role === "superadmin"
                    ? "Full system authority to manage user roles, elevate administrators, and oversee all operations."
                    : selectedUser.role === "admin"
                    ? "Administrative control: oversee the team directory, create projects, and manage tasks."
                    : "Standard employee access: collaborate on assigned projects, update task statuses, and view work."}
                </p>
              </div>

              <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
                <span className="text-[13px] font-medium text-text-secondary">
                  Role status
                </span>
                {isSuperAdmin &&
                selectedUser.role !== "superadmin" &&
                selectedUser.email !== currentUser?.email ? (
                  <select
                    aria-label="Update Role in Profile Modal"
                    value={selectedUser.role}
                    disabled={loading || updatingEmail === selectedUser.email}
                    onChange={(e) => handleRoleChange(selectedUser.email, e.target.value)}
                    className="h-8 rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-text-primary outline-none focus:border-brand transition-colors cursor-pointer shadow-subtle"
                  >
                    <option value="user">Employee</option>
                    <option value="admin">Administrator</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <RoleBadge role={selectedUser.role} size="xs" />
                    <span className="text-[12px] text-text-tertiary">
                      {selectedUser.role === "superadmin"
                        ? "(Root account)"
                        : selectedUser.email === currentUser?.email
                        ? "(Your account)"
                        : "(Managed by Super Admin)"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2">
              <div>
                {isSuperAdmin && selectedUser.role !== "superadmin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setResetTargetUser(selectedUser);
                      setNewPasswordValue("");
                      setResetError("");
                      setResetPasswordModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 h-9 rounded-md border border-border bg-surface px-3 text-[12px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer shadow-subtle"
                  >
                    <LockIcon className="h-3.5 w-3.5" />
                    <span>Reset Password</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="h-9 rounded-md border border-border bg-surface px-4 text-[13px] font-medium text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer shadow-subtle"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create User Modal (Super Admin only) */}
      {createUserModalOpen && (
        <Modal
          isOpen={createUserModalOpen}
          onClose={() => setCreateUserModalOpen(false)}
          title="Create Team Member Account"
        >
          <form onSubmit={handleCreateUser} className="space-y-4 text-left">
            {createError && <Alert message={createError} type="error" />}

            <div>
              <label className="mb-1 block text-[13px] font-medium text-text-secondary">
                Full Name
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={newUserData.name}
                onChange={(e) =>
                  setNewUserData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Jane Doe"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand shadow-subtle"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-medium text-text-secondary">
                Work Email
              </label>
              <input
                type="email"
                required
                maxLength={254}
                value={newUserData.email}
                onChange={(e) =>
                  setNewUserData((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="jane@rankrise.com"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand shadow-subtle"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-medium text-text-secondary">
                Initial Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                maxLength={128}
                value={newUserData.password}
                onChange={(e) =>
                  setNewUserData((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Min. 6 characters"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand shadow-subtle"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-medium text-text-secondary">
                Role
              </label>
              <select
                value={newUserData.role}
                onChange={(e) =>
                  setNewUserData((prev) => ({ ...prev, role: e.target.value }))
                }
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-text-primary outline-none focus:border-brand shadow-subtle cursor-pointer"
              >
                <option value="user">Employee (Standard Member)</option>
                <option value="admin">Administrator (Project Manager)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setCreateUserModalOpen(false)}
                className="h-9 rounded-md border border-border bg-surface px-4 text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-subtle cursor-pointer shadow-subtle"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingUser}
                className="h-9 rounded-md bg-brand hover:bg-brand-hover text-brand-text px-4 text-[13px] font-medium disabled:opacity-50 cursor-pointer shadow-subtle"
              >
                {creatingUser ? "Creating..." : "Create Account"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reset Password Modal (Super Admin only) */}
      {resetPasswordModalOpen && resetTargetUser && (
        <Modal
          isOpen={resetPasswordModalOpen}
          onClose={() => setResetPasswordModalOpen(false)}
          title={`Reset Password: ${resetTargetUser.name || resetTargetUser.email}`}
        >
          <form onSubmit={handleResetPassword} className="space-y-4 text-left">
            {resetError && <Alert message={resetError} type="error" />}

            <p className="text-sm text-text-secondary leading-relaxed">
              Set a new password for <strong>{resetTargetUser.email}</strong>.
            </p>

            <div>
              <label className="mb-1 block text-[13px] font-medium text-text-secondary">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                maxLength={128}
                value={newPasswordValue}
                onChange={(e) => setNewPasswordValue(e.target.value)}
                placeholder="Min. 6 characters"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-brand shadow-subtle"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setResetPasswordModalOpen(false)}
                className="h-9 rounded-md border border-border bg-surface px-4 text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-subtle cursor-pointer shadow-subtle"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resettingPassword}
                className="h-9 rounded-md bg-brand hover:bg-brand-hover text-brand-text px-4 text-[13px] font-medium disabled:opacity-50 cursor-pointer shadow-subtle"
              >
                {resettingPassword ? "Saving..." : "Update Password"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default ManageUsers;
