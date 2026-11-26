export function Icon({
  name,
  className = "w-5 h-5",
  strokeWidth = 2,
  ...props
}) {
  const icons = {
    dashboard: <path d="M3 3h7v9H3zm11 0h7v5h-7zm0 9h7v9h-7zM3 16h7v5H3z" />,
    projects: (
      <>
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        <path d="M8 10v4" />
        <path d="M12 10v2" />
        <path d="M16 10v6" />
      </>
    ),
    tasks: (
      <>
        <path d="m9 11 3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    bell: (
      <>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </>
    ),
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronUp: <path d="m18 15-6-6-6 6" />,
    moreHorizontal: (
      <>
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
        <circle cx="5" cy="12" r="1" />
      </>
    ),
    moreVertical: (
      <>
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="19" r="1" />
      </>
    ),
    edit: (
      <>
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        <path d="m15 5 4 4" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        <line x1="10" x2="10" y1="11" y2="17" />
        <line x1="14" x2="14" y1="11" y2="17" />
      </>
    ),
    close: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    calendar: (
      <>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>
    ),
    menu: (
      <>
        <line x1="4" x2="20" y1="12" y2="12" />
        <line x1="4" x2="20" y1="6" y2="6" />
        <line x1="4" x2="20" y1="18" y2="18" />
      </>
    ),
    kanban: (
      <>
        <path d="M6 5v11" />
        <path d="M12 5v6" />
        <path d="M18 5v14" />
      </>
    ),
    list: (
      <>
        <line x1="8" x2="21" y1="6" y2="6" />
        <line x1="8" x2="21" y1="12" y2="12" />
        <line x1="8" x2="21" y1="18" y2="18" />
        <line x1="3" x2="3.01" y1="6" y2="6" />
        <line x1="3" x2="3.01" y1="12" y2="12" />
        <line x1="3" x2="3.01" y1="18" y2="18" />
      </>
    ),
    grid: (
      <>
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
      </>
    ),
    filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,
    eye: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    eyeOff: (
      <>
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" x2="22" y1="2" y2="22" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" x2="9" y1="12" y2="12" />
      </>
    ),
    sparkles: (
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    ),
    user: (
      <>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    mail: (
      <>
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </>
    ),
    lock: (
      <>
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    trendingUp: (
      <>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </>
    ),
    alertCircle: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" x2="12" y1="8" y2="12" />
        <line x1="12" x2="12.01" y1="16" y2="16" />
      </>
    ),
    checkCircle: (
      <>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </>
    ),
    alertTriangle: (
      <>
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" x2="12" y1="9" y2="13" />
        <line x1="12" x2="12.01" y1="17" y2="17" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" x2="12" y1="16" y2="12" />
        <line x1="12" x2="12.01" y1="8" y2="8" />
      </>
    ),
    layers: (
      <>
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </>
    ),
    arrowLeft: (
      <>
        <line x1="19" x2="5" y1="12" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </>
    ),
    arrowRight: (
      <>
        <line x1="5" x2="19" y1="12" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </>
    ),
    userPlus: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <line x1="20" x2="20" y1="8" y2="14" />
        <line x1="23" x2="17" y1="11" y2="11" />
      </>
    ),
    rotateCw: (
      <>
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </>
    ),
    briefcase: (
      <>
        <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </>
    ),
    building: (
      <>
        <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01" />
        <path d="M16 6h.01" />
        <path d="M12 6h.01" />
        <path d="M12 10h.01" />
        <path d="M12 14h.01" />
        <path d="M16 10h.01" />
        <path d="M16 14h.01" />
        <path d="M8 10h.01" />
        <path d="M8 14h.01" />
      </>
    ),
    copy: (
      <>
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </>
    ),
    badgeCheck: (
      <>
        <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    table: (
      <>
        <path d="M12 3v18" />
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" />
        <path d="M3 15h18" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </>
    ),
    fileText: (
      <>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M10 9H8" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
      </>
    ),
    moon: (
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    ),
    messageSquare: (
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    ),
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    hash: (
      <>
        <line x1="4" x2="20" y1="9" y2="9" />
        <line x1="4" x2="20" y1="15" y2="15" />
        <line x1="10" x2="8" y1="3" y2="21" />
        <line x1="16" x2="14" y1="3" y2="21" />
      </>
    ),
    reply: (
      <>
        <polyline points="9 17 4 12 9 7" />
        <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>
    ),
  };

  const content = icons[name] || icons.sparkles;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {content}
    </svg>
  );
}

// Named Icon helper exports
export const CheckCircleIcon = (props) => <Icon name="checkCircle" {...props} />;
export const AlertTriangleIcon = (props) => <Icon name="alertTriangle" {...props} />;
export const AlertCircleIcon = (props) => <Icon name="alertCircle" {...props} />;
export const InfoIcon = (props) => <Icon name="info" {...props} />;
export const XIcon = (props) => <Icon name="close" {...props} />;
export const CloseIcon = (props) => <Icon name="close" {...props} />;
export const LayersIcon = (props) => <Icon name="layers" {...props} />;
export const LayoutDashboardIcon = (props) => <Icon name="dashboard" {...props} />;
export const DashboardIcon = (props) => <Icon name="dashboard" {...props} />;
export const FolderIcon = (props) => <Icon name="projects" {...props} />;
export const ProjectsIcon = (props) => <Icon name="projects" {...props} />;
export const CheckSquareIcon = (props) => <Icon name="tasks" {...props} />;
export const TasksIcon = (props) => <Icon name="tasks" {...props} />;
export const UsersIcon = (props) => <Icon name="users" {...props} />;
export const UserIcon = (props) => <Icon name="user" {...props} />;
export const UserPlusIcon = (props) => <Icon name="userPlus" {...props} />;
export const MailIcon = (props) => <Icon name="mail" {...props} />;
export const LockIcon = (props) => <Icon name="lock" {...props} />;
export const EyeIcon = (props) => <Icon name="eye" {...props} />;
export const EyeOffIcon = (props) => <Icon name="eyeOff" {...props} />;
export const ShieldIcon = (props) => <Icon name="shield" {...props} />;
export const SearchIcon = (props) => <Icon name="search" {...props} />;
export const PlusIcon = (props) => <Icon name="plus" {...props} />;
export const BellIcon = (props) => <Icon name="bell" {...props} />;
export const CalendarIcon = (props) => <Icon name="calendar" {...props} />;
export const ClockIcon = (props) => <Icon name="clock" {...props} />;
export const EditIcon = (props) => <Icon name="edit" {...props} />;
export const TrashIcon = (props) => <Icon name="trash" {...props} />;
export const KanbanIcon = (props) => <Icon name="kanban" {...props} />;
export const ListIcon = (props) => <Icon name="list" {...props} />;
export const TableIcon = (props) => <Icon name="table" {...props} />;
export const GridIcon = (props) => <Icon name="grid" {...props} />;
export const LogOutIcon = (props) => <Icon name="logout" {...props} />;
export const LogoutIcon = (props) => <Icon name="logout" {...props} />;
export const ChevronLeftIcon = (props) => <Icon name="chevronLeft" {...props} />;
export const ChevronRightIcon = (props) => <Icon name="chevronRight" {...props} />;
export const ChevronDownIcon = (props) => <Icon name="chevronDown" {...props} />;
export const ChevronUpIcon = (props) => <Icon name="chevronUp" {...props} />;
export const TrendingUpIcon = (props) => <Icon name="trendingUp" {...props} />;
export const ZapIcon = (props) => <Icon name="sparkles" {...props} />;
export const SparklesIcon = (props) => <Icon name="sparkles" {...props} />;
export const MenuIcon = (props) => <Icon name="menu" {...props} />;
export const ArrowLeftIcon = (props) => <Icon name="arrowLeft" {...props} />;
export const ArrowRightIcon = (props) => <Icon name="arrowRight" {...props} />;
export const RotateCwIcon = (props) => <Icon name="rotateCw" {...props} />;
export const BriefcaseIcon = (props) => <Icon name="briefcase" {...props} />;
export const BuildingIcon = (props) => <Icon name="building" {...props} />;
export const CopyIcon = (props) => <Icon name="copy" {...props} />;
export const BadgeCheckIcon = (props) => <Icon name="badgeCheck" {...props} />;
export const FileTextIcon = (props) => <Icon name="fileText" {...props} />;
export const SunIcon = (props) => <Icon name="sun" {...props} />;
export const MoonIcon = (props) => <Icon name="moon" {...props} />;
export const MessageSquareIcon = (props) => <Icon name="messageSquare" {...props} />;
export const SendIcon = (props) => <Icon name="send" {...props} />;
export const HashIcon = (props) => <Icon name="hash" {...props} />;
export const ReplyIcon = (props) => <Icon name="reply" {...props} />;
export const LinkIcon = (props) => <Icon name="link" {...props} />;

export default Icon;
