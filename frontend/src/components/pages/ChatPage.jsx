import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useChat } from "../../hooks/useChat";
import useProjects from "../../hooks/useProjects";
import useTasks from "../../hooks/useTasks";
import ConversationList from "../chat/ConversationList";
import MessageThread from "../chat/MessageThread";
import MessageComposer from "../chat/MessageComposer";
import NewChatModal from "../chat/NewChatModal";
import TaskDetailModal from "../tasks/TaskDetailModal";
import { getEntityId } from "../chat/chatHelpers";

export function ChatPage({ user }) {
  const { conversationId: routeConvId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: authUser } = useAuth();
  const effectiveUser = user || authUser;
  const currentUserId = getEntityId(effectiveUser);
  const { error: toastError } = useToast();

  const {
    conversations,
    loadingConversations,
    activeConversationId,
    setActiveConversationId,
    messagesByConv,
    hasMoreByConv,
    loadingMessages,
    chatUsers,
    onlineIds,
    wsConnected,
    typingByConv,
    loadConversations,
    loadChatUsers,
    loadMessages,
    openDirectChat,
    openProjectChat,
    createGroupChat,
    sendMessage,
    editMessage,
    deleteMessage,
    markConversationRead,
    sendTyping,
  } = useChat();

  const { projects, fetchProjects } = useProjects();
  const taskState = useTasks(effectiveUser, { limit: 100 });
  const { fetchTasks } = taskState;

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [mobileShowThread, setMobileShowThread] = useState(Boolean(routeConvId));
  const [selectedTask, setSelectedTask] = useState(null);

  useEffect(() => {
    void loadConversations();
    void loadChatUsers();
    void fetchProjects();
    void fetchTasks();
  }, [loadConversations, loadChatUsers, fetchProjects, fetchTasks]);

  // Support deep link /chat?project=<projectId> or /chat/:conversationId
  const projectParam = searchParams.get("project");
  useEffect(() => {
    if (projectParam) {
      let active = true;
      openProjectChat(projectParam)
        .then((conv) => {
          if (!active) return;
          if (conv?._id) {
            setActiveConversationId(conv._id);
            setMobileShowThread(true);
          }
          setSearchParams({}, { replace: true });
        })
        .catch((err) => {
          if (active) {
            toastError(err.response?.data?.message || "Unable to open project chat");
            setSearchParams({}, { replace: true });
          }
        });
      return () => {
        active = false;
      };
    }

    if (routeConvId) {
      setActiveConversationId(routeConvId);
      setMobileShowThread(true);
    }
    return undefined;
  }, [
    projectParam,
    routeConvId,
    openProjectChat,
    setActiveConversationId,
    setSearchParams,
    toastError,
  ]);

  // On desktop, auto-select the most recent conversation if none selected
  useEffect(() => {
    if (
      !activeConversationId &&
      !projectParam &&
      !routeConvId &&
      conversations.length > 0 &&
      typeof window !== "undefined" &&
      window.innerWidth >= 1024
    ) {
      setActiveConversationId(conversations[0]._id);
    }
  }, [
    activeConversationId,
    projectParam,
    routeConvId,
    conversations,
    setActiveConversationId,
  ]);

  // Clear active conversation ID when leaving ChatPage so background messages increment unread badge
  useEffect(() => {
    return () => {
      setActiveConversationId(null);
    };
  }, [setActiveConversationId]);

  // Fetch messages and mark read whenever active conversation changes
  useEffect(() => {
    if (!activeConversationId) return;
    setReplyTo(null);
    void loadMessages(activeConversationId);
    void markConversationRead(activeConversationId);
  }, [activeConversationId, loadMessages, markConversationRead]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c._id === activeConversationId) || null,
    [conversations, activeConversationId],
  );

  const activeMessages = useMemo(
    () => (activeConversationId ? messagesByConv[activeConversationId] || [] : []),
    [messagesByConv, activeConversationId],
  );

  const activeHasMore = Boolean(
    activeConversationId && hasMoreByConv[activeConversationId],
  );

  const activeTypingUsers = useMemo(
    () => (activeConversationId ? typingByConv[activeConversationId] || [] : []),
    [typingByConv, activeConversationId],
  );

  const handleSelectConversation = (convId) => {
    setActiveConversationId(convId);
    setMobileShowThread(true);
  };

  const handleLoadOlder = async () => {
    if (!activeConversationId || activeMessages.length === 0) return;
    const oldest = activeMessages[0];
    if (!oldest?.createdAt) return;
    await loadMessages(activeConversationId, { before: oldest.createdAt });
  };

  const handleStartDirect = async (targetId) => {
    const conv = await openDirectChat(targetId);
    if (conv?._id) {
      setActiveConversationId(conv._id);
      setMobileShowThread(true);
    }
  };

  const handleCreateGroup = async ({ name, participantIds }) => {
    const conv = await createGroupChat({ name, participantIds });
    if (conv?._id) {
      setActiveConversationId(conv._id);
      setMobileShowThread(true);
    }
  };

  const handleDeleteMessage = async (msgId) => {
    if (!window.confirm("Delete this message?")) return;
    try {
      await deleteMessage(msgId);
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to delete message");
    }
  };

  const handleEditMessage = async (msgId, content) => {
    try {
      await editMessage(msgId, content);
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to edit message");
    }
  };

  const handleOpenLinkedTask = async (linkedTask) => {
    const tid = getEntityId(linkedTask);
    if (!tid) return;

    const existing = taskState.allTasks.find((t) => getEntityId(t) === tid);
    if (existing) {
      setSelectedTask(existing);
      return;
    }

    try {
      const res = await api.get(`/tasks/${tid}`);
      if (res.data?.task) {
        setSelectedTask(res.data.task);
      }
    } catch (err) {
      toastError(
        err.response?.data?.message ||
          "You do not have permission to open details for this task.",
      );
    }
  };

  return (
    <div className="h-[calc(100vh-8.25rem)] min-h-[520px] rounded-lg border border-border bg-surface shadow-subtle overflow-hidden flex flex-col lg:grid lg:grid-cols-12">
      {/* Left Sidebar: Conversations */}
      <div
        className={`h-full min-h-0 lg:col-span-4 xl:col-span-3 ${
          mobileShowThread ? "hidden lg:block" : "flex-1 block"
        }`}
      >
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onOpenNewChat={() => {
            void loadChatUsers();
            setNewChatOpen(true);
          }}
          currentUserId={currentUserId}
          onlineIds={onlineIds}
          wsConnected={wsConnected}
          loading={loadingConversations}
        />
      </div>

      {/* Right Pane: Thread & Composer */}
      <div
        className={`h-full min-h-0 flex-col lg:col-span-8 xl:col-span-9 ${
          mobileShowThread ? "flex flex-1" : "hidden lg:flex"
        }`}
      >
        <div className="flex-1 min-h-0">
          <MessageThread
            conversation={activeConversation}
            messages={activeMessages}
            hasMore={activeHasMore}
            loading={loadingMessages}
            currentUser={effectiveUser}
            onlineIds={onlineIds}
            typingUsers={activeTypingUsers}
            onLoadOlder={handleLoadOlder}
            onReply={(msg) => setReplyTo(msg)}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onOpenTask={handleOpenLinkedTask}
            onBackMobile={() => setMobileShowThread(false)}
          />
        </div>

        {activeConversation && (
          <MessageComposer
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            tasks={taskState.allTasks}
            onSendMessage={(payload) =>
              sendMessage(activeConversation._id, payload)
            }
            onTyping={(isTyping) =>
              sendTyping(activeConversation._id, isTyping)
            }
          />
        )}
      </div>

      <NewChatModal
        isOpen={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        users={chatUsers}
        onlineIds={onlineIds}
        currentUserId={currentUserId}
        onStartDirect={handleStartDirect}
        onCreateGroup={handleCreateGroup}
      />

      {selectedTask && (
        <TaskDetailModal
          isOpen={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          projects={projects}
          user={effectiveUser}
          onUpdate={taskState.updateTask}
          onDelete={taskState.deleteTask}
        />
      )}
    </div>
  );
}

export default ChatPage;
