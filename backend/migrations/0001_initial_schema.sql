
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password TEXT NOT NULL,
    token_version INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'user'
        CHECK(role IN ('user', 'admin', 'superadmin')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id TEXT NOT NULL,
    project_head_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id),
    FOREIGN KEY (project_head_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS project_members (
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo'
        CHECK(status IN ('todo', 'in-progress', 'testing', 'completed', 'done')),
    priority TEXT NOT NULL DEFAULT 'low'
        CHECK(priority IN ('low', 'medium', 'high')),
    project_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    assigned_at TEXT,
    submitted_by TEXT,
    submitted_at TEXT,
    scheduled_start_at TEXT,
    started_at TEXT,
    due_date TEXT,
    completed_at TEXT,
    done_at TEXT,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0
        CHECK(time_spent_seconds >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (submitted_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS task_assignees (
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (task_id, user_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL CHECK(length(content) <= 1000),
    task_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS task_activities (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN (
        'created',
        'status_changed',
        'priority_changed',
        'assigned',
        'schedule_changed',
        'due_date_changed',
        'submitted',
        'completed'
    )),
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS legacy_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    selector_hash TEXT NOT NULL,
    browser_key_hash TEXT NOT NULL,
    family_id TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0
        CHECK(is_active IN (0, 1)),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);
CREATE INDEX IF NOT EXISTS idx_activities_task ON task_activities(task_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_legacy_sessions_user ON legacy_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_legacy_sessions_family ON legacy_sessions(family_id);
