const {
  getDatabase,
  createId,
  idOf,
  nowIso,
  toDate,
  placeholders,
  getUsersByIds,
} = require("../db/d1");

let initializedDb = null;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('direct', 'project', 'group')),
    name TEXT,
    project_id TEXT UNIQUE,
    dm_key TEXT UNIQUE,
    created_by TEXT NOT NULL,
    last_message_at TEXT,
    last_message_preview TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    last_read_at TEXT,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL CHECK(length(content) <= 4000),
    task_id TEXT,
    reply_to_id TEXT,
    edited_at TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (reply_to_id) REFERENCES chat_messages(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created ON chat_messages(conversation_id, created_at DESC)`,
];

/**
 * Ensures chat schema exists in D1 cleanly (idempotent once per isolate/db instance).
 */
const ensureChatSchema = async () => {
  const db = getDatabase();
  if (initializedDb === db) return db;
  await db.batch(SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));
  initializedDb = db;
  return db;
};

const makeDmKey = (userA, userB) => {
  const [a, b] = [String(userA), String(userB)].sort();
  return `${a}:${b}`;
};

const toPublicUser = (u) =>
  u
    ? {
        _id: String(u._id || u.id),
        name: u.name || "Team Member",
        role: u.role || "user",
      }
    : null;

const truncatePreview = (text = "") => {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= 100) return clean;
  return `${clean.slice(0, 97)}...`;
};

const getAccessibleProjects = async (db, userId, role) => {
  if (role === "superadmin") {
    const { results = [] } = await db
      .prepare(
        `SELECT id, name, owner_id, project_head_id
         FROM projects ORDER BY created_at DESC`,
      )
      .all();
    return results;
  }

  const uid = String(userId);
  const { results = [] } = await db
    .prepare(
      `SELECT DISTINCT p.id, p.name, p.owner_id, p.project_head_id
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE p.owner_id = ? OR p.project_head_id = ? OR pm.user_id = ?
       ORDER BY p.created_at DESC`,
    )
    .bind(uid, uid, uid)
    .all();
  return results;
};

const getProjectMemberIdsMap = async (db, projectRows) => {
  const map = new Map();
  if (!projectRows.length) return map;

  const projectIds = projectRows.map((p) => String(p.id));
  for (const p of projectRows) {
    const ids = new Set();
    if (p.owner_id) ids.add(String(p.owner_id));
    if (p.project_head_id) ids.add(String(p.project_head_id));
    map.set(String(p.id), ids);
  }

  const { results = [] } = await db
    .prepare(
      `SELECT project_id, user_id FROM project_members
       WHERE project_id IN (${placeholders(projectIds)})`,
    )
    .bind(...projectIds)
    .all();

  for (const row of results) {
    map.get(String(row.project_id))?.add(String(row.user_id));
  }

  return map;
};

const hydrateMessages = async (db, rows) => {
  if (!rows.length) return [];

  const senderIds = [];
  const taskIds = [];
  const replyIds = [];

  for (const row of rows) {
    if (row.sender_id) senderIds.push(row.sender_id);
    if (row.task_id) taskIds.push(row.task_id);
    if (row.reply_to_id) replyIds.push(row.reply_to_id);
  }

  const uniqueTaskIds = [...new Set(taskIds.map(String))];
  const uniqueReplyIds = [...new Set(replyIds.map(String))];

  const [usersMap, taskResults, replyResults] = await Promise.all([
    getUsersByIds(senderIds),
    uniqueTaskIds.length
      ? db
          .prepare(
            `SELECT id, title, status, priority, due_date, project_id
             FROM tasks WHERE id IN (${placeholders(uniqueTaskIds)})`,
          )
          .bind(...uniqueTaskIds)
          .all()
      : Promise.resolve({ results: [] }),
    uniqueReplyIds.length
      ? db
          .prepare(
            `SELECT id, sender_id, content, deleted_at
             FROM chat_messages WHERE id IN (${placeholders(uniqueReplyIds)})`,
          )
          .bind(...uniqueReplyIds)
          .all()
      : Promise.resolve({ results: [] }),
  ]);

  // Also fetch reply senders if any
  const replyRows = replyResults?.results || [];
  const missingReplySenderIds = replyRows
    .map((r) => r.sender_id)
    .filter((id) => id && !usersMap.has(String(id)));

  if (missingReplySenderIds.length) {
    const extraUsers = await getUsersByIds(missingReplySenderIds);
    for (const [k, v] of extraUsers.entries()) {
      usersMap.set(k, v);
    }
  }

  const taskMap = new Map(
    (taskResults?.results || []).map((t) => [
      String(t.id),
      {
        _id: String(t.id),
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: toDate(t.due_date),
        project: String(t.project_id),
      },
    ]),
  );

  const replyMap = new Map(
    replyRows.map((r) => {
      const sender = usersMap.get(String(r.sender_id));
      return [
        String(r.id),
        {
          _id: String(r.id),
          content: r.deleted_at ? "This message was deleted" : r.content,
          deleted: Boolean(r.deleted_at),
          sender: sender
            ? { _id: String(sender._id), name: sender.name }
            : { _id: String(r.sender_id), name: "Team Member" },
        },
      ];
    }),
  );

  return rows.map((row) => {
    const sender = usersMap.get(String(row.sender_id));
    const isDeleted = Boolean(row.deleted_at);
    return {
      _id: String(row.id),
      conversationId: String(row.conversation_id),
      sender: sender
        ? { _id: String(sender._id), name: sender.name, role: sender.role }
        : { _id: String(row.sender_id), name: "Team Member", role: "user" },
      content: isDeleted ? "" : row.content,
      deleted: isDeleted,
      deletedAt: toDate(row.deleted_at),
      editedAt: toDate(row.edited_at),
      task: !isDeleted && row.task_id ? taskMap.get(String(row.task_id)) || null : null,
      replyTo: row.reply_to_id ? replyMap.get(String(row.reply_to_id)) || null : null,
      createdAt: toDate(row.created_at),
      updatedAt: toDate(row.updated_at),
    };
  });
};

const getUnreadCountsMap = async (db, conversationIds, userId) => {
  const map = new Map();
  if (!conversationIds.length) return map;

  const uid = String(userId);
  const { results = [] } = await db
    .prepare(
      `SELECT m.conversation_id, COUNT(*) AS unread_count
       FROM chat_messages m
       LEFT JOIN conversation_participants cp
         ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
       WHERE m.conversation_id IN (${placeholders(conversationIds)})
         AND m.deleted_at IS NULL
         AND m.sender_id != ?
         AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
       GROUP BY m.conversation_id`,
    )
    .bind(uid, ...conversationIds, uid)
    .all();

  for (const row of results) {
    map.set(String(row.conversation_id), Number(row.unread_count || 0));
  }
  return map;
};

const ChatRepository = {
  async listUsersForChat() {
    const db = await ensureChatSchema();
    const { results = [] } = await db
      .prepare("SELECT id, name, role FROM users ORDER BY name COLLATE NOCASE ASC")
      .all();
    return results.map(toPublicUser);
  },

  async findUserById(userId) {
    const db = await ensureChatSchema();
    const row = await db
      .prepare("SELECT id, name, role FROM users WHERE id = ? LIMIT 1")
      .bind(String(userId))
      .first();
    return toPublicUser(row);
  },

  async listConversationsForUser(userId, role) {
    const db = await ensureChatSchema();
    const uid = String(userId);
    const projects = await getAccessibleProjects(db, uid, role);

    // Ensure every accessible project has a corresponding project channel row
    if (projects.length > 0) {
      const ts = nowIso();
      const projectInserts = projects.map((proj) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO conversations (
               id, type, name, project_id, dm_key, created_by,
               last_message_at, last_message_preview, created_at, updated_at
             ) VALUES (?, 'project', ?, ?, NULL, ?, NULL, NULL, ?, ?)`,
          )
          .bind(
            createId(),
            proj.name,
            String(proj.id),
            String(proj.owner_id || uid),
            ts,
            ts,
          ),
      );
      await db.batch(projectInserts);
    }

    const projectMap = new Map(projects.map((p) => [String(p.id), p]));
    const projectIds = [...projectMap.keys()];

    const directGroupRows = (
      await db
        .prepare(
          `SELECT c.* FROM conversations c
           INNER JOIN conversation_participants cp ON cp.conversation_id = c.id
           WHERE cp.user_id = ? AND c.type IN ('direct', 'group')`,
        )
        .bind(uid)
        .all()
    ).results || [];

    const projectConvRows = projectIds.length
      ? (
          await db
            .prepare(
              `SELECT * FROM conversations
               WHERE type = 'project' AND project_id IN (${placeholders(projectIds)})`,
            )
            .bind(...projectIds)
            .all()
        ).results || []
      : [];

    const allConvs = [...directGroupRows, ...projectConvRows];
    if (!allConvs.length) return [];

    // Sort newest activity first, then createdAt desc
    allConvs.sort((a, b) => {
      const ta = a.last_message_at || a.created_at;
      const tb = b.last_message_at || b.created_at;
      return tb.localeCompare(ta);
    });

    const convIds = allConvs.map((c) => String(c.id));
    const directGroupIds = directGroupRows.map((c) => String(c.id));

    const [participantRows, projectMembersMap, unreadMap, readRows] = await Promise.all([
      directGroupIds.length
        ? db
            .prepare(
              `SELECT conversation_id, user_id, last_read_at
               FROM conversation_participants
               WHERE conversation_id IN (${placeholders(directGroupIds)})`,
            )
            .bind(...directGroupIds)
            .all()
            .then((r) => r.results || [])
        : Promise.resolve([]),
      getProjectMemberIdsMap(db, projects),
      getUnreadCountsMap(db, convIds, uid),
      db
        .prepare(
          `SELECT conversation_id, last_read_at
           FROM conversation_participants
           WHERE user_id = ? AND conversation_id IN (${placeholders(convIds)})`,
        )
        .bind(uid, ...convIds)
        .all()
        .then((r) => r.results || []),
    ]);

    const readMap = new Map(
      readRows.map((r) => [String(r.conversation_id), toDate(r.last_read_at)]),
    );

    const directParticipantsMap = new Map();
    const neededUserIds = new Set();

    for (const row of participantRows) {
      const cid = String(row.conversation_id);
      if (!directParticipantsMap.has(cid)) directParticipantsMap.set(cid, []);
      directParticipantsMap.get(cid).push(String(row.user_id));
      neededUserIds.add(String(row.user_id));
    }

    for (const memberSet of projectMembersMap.values()) {
      for (const mid of memberSet) neededUserIds.add(mid);
    }

    const usersMap = await getUsersByIds([...neededUserIds]);

    return allConvs.map((conv) => {
      const cid = String(conv.id);
      const isProject = conv.type === "project";
      const pid = conv.project_id ? String(conv.project_id) : null;

      const memberIds = isProject
        ? [...(projectMembersMap.get(pid) || [])]
        : directParticipantsMap.get(cid) || [];

      const participants = memberIds
        .map((id) => toPublicUser(usersMap.get(id)))
        .filter(Boolean);

      const liveProject = pid ? projectMap.get(pid) : null;

      return {
        _id: cid,
        type: conv.type,
        name: isProject ? liveProject?.name || conv.name : conv.name,
        project: liveProject
          ? { _id: String(liveProject.id), name: liveProject.name }
          : pid
            ? { _id: pid, name: conv.name }
            : null,
        participants,
        lastMessageAt: toDate(conv.last_message_at),
        lastMessagePreview: conv.last_message_preview || null,
        lastReadAt: readMap.get(cid) || null,
        unreadCount: unreadMap.get(cid) || 0,
        createdAt: toDate(conv.created_at),
        updatedAt: toDate(conv.updated_at),
      };
    });
  },

  async findOrCreateDirectConversation(currentUserId, targetUserId) {
    const db = await ensureChatSchema();
    const uid = String(currentUserId);
    const tid = String(targetUserId);
    const dmKey = makeDmKey(uid, tid);
    const ts = nowIso();

    let conv = await db
      .prepare("SELECT * FROM conversations WHERE dm_key = ? LIMIT 1")
      .bind(dmKey)
      .first();

    if (!conv) {
      const newId = createId();
      await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO conversations (
               id, type, name, project_id, dm_key, created_by,
               last_message_at, last_message_preview, created_at, updated_at
             ) VALUES (?, 'direct', NULL, NULL, ?, ?, NULL, NULL, ?, ?)`,
          )
          .bind(newId, dmKey, uid, ts, ts),
      ]);

      conv = await db
        .prepare("SELECT * FROM conversations WHERE dm_key = ? LIMIT 1")
        .bind(dmKey)
        .first();
    }

    const cid = String(conv.id);
    const participantIds = [...new Set([uid, tid])];
    await db.batch(
      participantIds.map((pid) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO conversation_participants
             (conversation_id, user_id, last_read_at, joined_at)
             VALUES (?, ?, NULL, ?)`,
          )
          .bind(cid, pid, ts),
      ),
    );

    const list = await this.listConversationsForUser(uid, "user");
    return (
      list.find((c) => c._id === cid) || {
        _id: cid,
        type: "direct",
        name: null,
        project: null,
        participants: [],
        unreadCount: 0,
      }
    );
  },

  async findOrCreateProjectConversation(projectId, userId, role) {
    const db = await ensureChatSchema();
    const uid = String(userId);
    const pid = String(projectId);

    const projects = await getAccessibleProjects(db, uid, role);
    const project = projects.find((p) => String(p.id) === pid);
    if (!project) return null;

    let conv = await db
      .prepare("SELECT * FROM conversations WHERE project_id = ? LIMIT 1")
      .bind(pid)
      .first();

    if (!conv) {
      const ts = nowIso();
      await db
        .prepare(
          `INSERT OR IGNORE INTO conversations (
             id, type, name, project_id, dm_key, created_by,
             last_message_at, last_message_preview, created_at, updated_at
           ) VALUES (?, 'project', ?, ?, NULL, ?, NULL, NULL, ?, ?)`,
        )
        .bind(createId(), project.name, pid, String(project.owner_id || uid), ts, ts)
        .run();

      conv = await db
        .prepare("SELECT * FROM conversations WHERE project_id = ? LIMIT 1")
        .bind(pid)
        .first();
    }

    const list = await this.listConversationsForUser(uid, role);
    return list.find((c) => c._id === String(conv.id)) || null;
  },

  async createGroupConversation(creatorId, name, participantIds = []) {
    const db = await ensureChatSchema();
    const cid = createId();
    const ts = nowIso();
    const uniqueParticipants = [...new Set([String(creatorId), ...participantIds.map(String)])];

    await db.batch([
      db
        .prepare(
          `INSERT INTO conversations (
             id, type, name, project_id, dm_key, created_by,
             last_message_at, last_message_preview, created_at, updated_at
           ) VALUES (?, 'group', ?, NULL, NULL, ?, NULL, NULL, ?, ?)`,
        )
        .bind(cid, name.trim(), String(creatorId), ts, ts),
      ...uniqueParticipants.map((uid) =>
        db
          .prepare(
            `INSERT INTO conversation_participants
             (conversation_id, user_id, last_read_at, joined_at)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(cid, uid, uid === String(creatorId) ? ts : null, ts),
      ),
    ]);

    const usersMap = await getUsersByIds(uniqueParticipants);
    const participants = uniqueParticipants
      .map((id) => toPublicUser(usersMap.get(id)))
      .filter(Boolean);

    return {
      _id: cid,
      type: "group",
      name: name.trim(),
      project: null,
      participants,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastReadAt: toDate(ts),
      unreadCount: 0,
      createdAt: toDate(ts),
      updatedAt: toDate(ts),
    };
  },

  async getConversationAccess(conversationId, userId, role) {
    const db = await ensureChatSchema();
    const cid = String(conversationId);
    const uid = String(userId);

    const conv = await db
      .prepare("SELECT * FROM conversations WHERE id = ? LIMIT 1")
      .bind(cid)
      .first();

    if (!conv) return null;

    if (conv.type === "project") {
      const pid = String(conv.project_id);
      const proj = await db
        .prepare("SELECT id, name, owner_id, project_head_id FROM projects WHERE id = ? LIMIT 1")
        .bind(pid)
        .first();
      if (!proj) return null;

      const membersMap = await getProjectMemberIdsMap(db, [proj]);
      const memberIds = [...(membersMap.get(pid) || [])];
      const hasAccess = role === "superadmin" || memberIds.includes(uid);
      if (!hasAccess) return { forbidden: true };

      return {
        forbidden: false,
        conversation: conv,
        participantIds: memberIds,
      };
    }

    const { results = [] } = await db
      .prepare(
        "SELECT user_id FROM conversation_participants WHERE conversation_id = ?",
      )
      .bind(cid)
      .all();

    const participantIds = results.map((r) => String(r.user_id));
    if (!participantIds.includes(uid)) {
      return { forbidden: true };
    }

    return {
      forbidden: false,
      conversation: conv,
      participantIds,
    };
  },

  async listMessages(conversationId, { before, after, limit = 50 } = {}) {
    const db = await ensureChatSchema();
    const cid = String(conversationId);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

    if (after) {
      const { results = [] } = await db
        .prepare(
          `SELECT * FROM chat_messages
           WHERE conversation_id = ? AND created_at > ?
           ORDER BY created_at ASC
           LIMIT ?`,
        )
        .bind(cid, new Date(after).toISOString(), safeLimit)
        .all();

      const messages = await hydrateMessages(db, results);
      return { messages, hasMore: false };
    }

    const clauses = ["conversation_id = ?"];
    const values = [cid];

    if (before) {
      clauses.push("created_at < ?");
      values.push(new Date(before).toISOString());
    }

    const { results = [] } = await db
      .prepare(
        `SELECT * FROM chat_messages
         WHERE ${clauses.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(...values, safeLimit + 1)
      .all();

    const hasMore = results.length > safeLimit;
    const sliced = hasMore ? results.slice(0, safeLimit) : results;
    sliced.reverse();

    const messages = await hydrateMessages(db, sliced);
    return { messages, hasMore };
  },

  async createMessage({ conversationId, senderId, content, taskId = null, replyToId = null }) {
    const db = await ensureChatSchema();
    const msgId = createId();
    const cid = String(conversationId);
    const sid = String(senderId);
    const ts = nowIso();
    const preview = truncatePreview(content);

    await db.batch([
      db
        .prepare(
          `INSERT INTO chat_messages (
             id, conversation_id, sender_id, content, task_id, reply_to_id,
             edited_at, deleted_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .bind(
          msgId,
          cid,
          sid,
          content,
          taskId ? String(idOf(taskId)) : null,
          replyToId ? String(idOf(replyToId)) : null,
          ts,
          ts,
        ),
      db
        .prepare(
          `UPDATE conversations
           SET last_message_at = ?, last_message_preview = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(ts, preview, ts, cid),
      db
        .prepare(
          `INSERT INTO conversation_participants (conversation_id, user_id, last_read_at, joined_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(conversation_id, user_id)
           DO UPDATE SET last_read_at = excluded.last_read_at`,
        )
        .bind(cid, sid, ts, ts),
    ]);

    const row = await db
      .prepare("SELECT * FROM chat_messages WHERE id = ? LIMIT 1")
      .bind(msgId)
      .first();

    const [hydrated] = await hydrateMessages(db, row ? [row] : []);
    return hydrated;
  },

  async markConversationRead(conversationId, userId) {
    const db = await ensureChatSchema();
    const ts = nowIso();
    await db
      .prepare(
        `INSERT INTO conversation_participants (conversation_id, user_id, last_read_at, joined_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(conversation_id, user_id)
         DO UPDATE SET last_read_at = excluded.last_read_at`,
      )
      .bind(String(conversationId), String(userId), ts, ts)
      .run();
    return toDate(ts);
  },

  async findMessageById(messageId) {
    const db = await ensureChatSchema();
    return db
      .prepare("SELECT * FROM chat_messages WHERE id = ? LIMIT 1")
      .bind(String(messageId))
      .first();
  },

  async editMessage(messageId, content) {
    const db = await ensureChatSchema();
    const ts = nowIso();
    const mid = String(messageId);

    await db
      .prepare(
        `UPDATE chat_messages
         SET content = ?, edited_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(content, ts, ts, mid)
      .run();

    const row = await db
      .prepare("SELECT * FROM chat_messages WHERE id = ? LIMIT 1")
      .bind(mid)
      .first();

    if (row) {
      const latest = await db
        .prepare(
          `SELECT id FROM chat_messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(String(row.conversation_id))
        .first();
      if (latest && String(latest.id) === mid) {
        await db
          .prepare("UPDATE conversations SET last_message_preview = ?, updated_at = ? WHERE id = ?")
          .bind(truncatePreview(content), ts, String(row.conversation_id))
          .run();
      }
    }

    const [hydrated] = await hydrateMessages(db, row ? [row] : []);
    return hydrated;
  },

  async softDeleteMessage(messageId) {
    const db = await ensureChatSchema();
    const ts = nowIso();
    const mid = String(messageId);

    await db
      .prepare(
        `UPDATE chat_messages
         SET deleted_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(ts, ts, mid)
      .run();

    const row = await db
      .prepare("SELECT * FROM chat_messages WHERE id = ? LIMIT 1")
      .bind(mid)
      .first();

    if (row) {
      const latest = await db
        .prepare(
          `SELECT id FROM chat_messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(String(row.conversation_id))
        .first();
      if (latest && String(latest.id) === mid) {
        await db
          .prepare("UPDATE conversations SET last_message_preview = ?, updated_at = ? WHERE id = ?")
          .bind("Message deleted", ts, String(row.conversation_id))
          .run();
      }
    }

    const [hydrated] = await hydrateMessages(db, row ? [row] : []);
    return hydrated;
  },

  async getUnreadSummary(userId, role) {
    const conversations = await this.listConversationsForUser(userId, role);
    const byConversation = {};
    let totalUnread = 0;
    for (const c of conversations) {
      const count = Number(c.unreadCount || 0);
      if (count > 0) {
        byConversation[c._id] = count;
        totalUnread += count;
      }
    }
    return { totalUnread, byConversation };
  },
};

module.exports = ChatRepository;
