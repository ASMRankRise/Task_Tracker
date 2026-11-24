import { NavLink, useNavigate } from "react-router-dom";
import { Avatar } from "../common/Avatar";
import { RoleBadge } from "../common/Badge";
import {
  BriefcaseIcon,
  LayoutDashboardIcon,
  FolderIcon,
  CheckSquareIcon,
  FileTextIcon,
  UsersIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  LogOutIcon,
  SunIcon,
} from "../common/Icons";

export function Sidebar({
  user,
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  onLogout,
  onOpenSettings,
}) {
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isSuperAdmin = user?.role === "superadmin";
  const navigationItems = [
    {
      label: "Workspace",
      items: [
        {
          to: isAdmin ? "/admin" : "/dashboard",
          label: "Overview",
          icon: LayoutDashboardIcon,
        },
        ...(isSuperAdmin
          ? [
            {
              to: "/admin/users",
              label: "Team Directory",
              icon: UsersIcon,
            },
          ]
          : []),
        {
          to: "/projects",
          label: "Projects",
          icon: FolderIcon,
        },
        {
          to: "/tasks",
          label: "Tasks",
          icon: CheckSquareIcon,
        },
        {
          to: "/reports",
          label: "Reports",
          icon: FileTextIcon,
        },
      ],
    },
  ];

  const handleNavClick = () => {
    if (mobileOpen) setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-surface text-text-primary transition-all duration-150 ease-in-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:z-auto ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          } ${collapsed ? "lg:w-16" : "w-60"}`}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-3.5">
          <div
            onClick={() => navigate("/")}
            className="flex cursor-pointer items-center gap-2.5 overflow-hidden"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-text font-bold text-xs shadow-subtle">
              <BriefcaseIcon className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight text-text-primary leading-none">
                  RankRise
                </span>
                <span className="text-[12px] font-medium tracking-normal text-text-secondary mt-0.5">
                  Workspace
                </span>
              </div>
            )}
          </div>

          {/* Desktop collapse button */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-md p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-subtle lg:block transition cursor-pointer"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRightIcon className="h-4 w-4" />
            ) : (
              <ChevronLeftIcon className="h-4 w-4" />
            )}
          </button>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-subtle lg:hidden cursor-pointer"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
          {navigationItems.map((group, gIdx) => (
            <div key={gIdx} className="space-y-0.5">
              {!collapsed && (
                <div className="px-3 pb-1 text-[12px] font-medium text-text-tertiary">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const IconComponent = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={handleNavClick}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${isActive
                        ? "bg-surface-subtle text-text-primary font-semibold border border-border shadow-subtle"
                        : "text-text-secondary hover:bg-surface-subtle/70 hover:text-text-primary"
                      } ${collapsed ? "justify-center px-0" : ""}`
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <IconComponent className="h-4 w-4 shrink-0 text-text-tertiary" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}

          {/* Preferences link */}
          <div className="space-y-0.5 pt-2 border-t border-border">
            {!collapsed && (
              <div className="px-3 pb-1 text-[12px] font-medium text-text-tertiary">
                System
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                handleNavClick();
                if (onOpenSettings) onOpenSettings();
              }}
              className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-subtle/70 hover:text-text-primary transition-colors cursor-pointer ${collapsed ? "justify-center px-0" : ""
                }`}
              title={collapsed ? "Preferences" : undefined}
            >
              <SunIcon className="h-4 w-4 shrink-0 text-text-tertiary" />
              {!collapsed && <span>Preferences</span>}
            </button>
          </div>
        </div>

        {/* User Card at Bottom */}
        <div className="border-t border-border p-2.5">
          <div
            className={`flex items-center gap-2 rounded-md bg-surface-subtle p-2 border border-border ${collapsed ? "justify-center p-1.5" : "justify-between"
              }`}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <Avatar user={user} size="sm" />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-text-primary leading-tight">
                    {user?.name || "User"}
                  </p>
                  <div className="mt-1">
                    <RoleBadge role={user?.role} size="sm" />
                  </div>
                </div>
              )}
            </div>

            {!collapsed && (
              <button
                type="button"
                onClick={onLogout}
                title="Log out"
                className="rounded-md p-1.5 text-text-tertiary hover:text-accent hover:bg-[#FEF2F2] dark:hover:bg-[#3B0D0D]/40 transition cursor-pointer"
              >
                <LogOutIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
