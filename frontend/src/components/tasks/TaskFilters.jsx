import {
  SearchIcon,
  KanbanIcon,
  ListIcon,
  TableIcon,
} from "../common/Icons";

export function TaskFilters({
  search = "",
  setSearch,
  statusFilter = "",
  setStatusFilter,
  priorityFilter = "",
  setPriorityFilter,
  assigneeFilter = "",
  setAssigneeFilter,
  viewMode = "kanban",
  setViewMode,
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-subtle lg:flex-row lg:items-center lg:justify-between">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px]">
        <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-text-tertiary" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by title or description..."
          aria-label="Search tasks"
          className="h-9 w-full rounded-md border border-border bg-surface py-1 pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand focus:ring-1 focus:ring-brand transition-colors shadow-subtle"
        />
      </div>

      {/* Select Filters & View Switcher */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Status Filter */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="h-9 rounded-md border border-border bg-surface px-3 py-1 text-[13px] font-medium text-text-secondary outline-none focus:border-brand transition-colors cursor-pointer shadow-subtle"
          >
            <option value="">All statuses</option>
            <option value="todo">To do</option>
            <option value="in-progress">In progress</option>
            <option value="testing">Testing</option>
            <option value="completed">Completed</option>
            <option value="done">Done</option>
          </select>
        </div>

        {/* Priority Filter */}
        <div className="relative">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter by priority"
            className="h-9 rounded-md border border-border bg-surface px-3 py-1 text-[13px] font-medium text-text-secondary outline-none focus:border-brand transition-colors cursor-pointer shadow-subtle"
          >
            <option value="">All priorities</option>
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
        </div>

        {/* Assignee Scope Filter */}
        {setAssigneeFilter && (
          <div className="relative">
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              aria-label="Filter by assignee"
              className="h-9 rounded-md border border-border bg-surface px-3 py-1 text-[13px] font-medium text-text-secondary outline-none focus:border-brand transition-colors cursor-pointer shadow-subtle"
            >
              <option value="">All project tasks</option>
              <option value="me">Assigned to me</option>
            </select>
          </div>
        )}

        {/* View Mode Toggle: Board vs Table vs Grid */}
        {setViewMode && (
          <div className="flex items-center rounded-md border border-border bg-surface-subtle p-0.5 text-[13px]">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                viewMode === "kanban"
                  ? "bg-surface text-text-primary shadow-subtle"
                  : "text-text-secondary hover:text-text-primary"
              }`}
              title="Board View"
            >
              <KanbanIcon className="h-3.5 w-3.5" />
              <span>Board</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                viewMode === "table"
                  ? "bg-surface text-text-primary shadow-subtle"
                  : "text-text-secondary hover:text-text-primary"
              }`}
              title="Table View"
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                viewMode === "list"
                  ? "bg-surface text-text-primary shadow-subtle"
                  : "text-text-secondary hover:text-text-primary"
              }`}
              title="Grid View"
            >
              <ListIcon className="h-3.5 w-3.5" />
              <span>Grid</span>
            </button>
          </div>
        )}

        {/* Clear Filters Button if any active */}
        {(statusFilter || priorityFilter || assigneeFilter || search) && (
          <button
            type="button"
            onClick={() => {
              setSearch?.("");
              setStatusFilter?.("");
              setPriorityFilter?.("");
              setAssigneeFilter?.("");
            }}
            className="h-9 rounded-md border border-border bg-surface px-3 py-1 text-[13px] font-medium text-text-secondary hover:bg-surface-subtle hover:text-text-primary transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export default TaskFilters;
