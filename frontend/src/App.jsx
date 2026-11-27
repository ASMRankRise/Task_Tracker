import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Loading from "./components/common/Loading";
import AuthForm from "./components/auth/AuthForm";
import LogoutPage from "./components/auth/LogoutPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import DashboardLayout from "./components/layout/DashboardLayout";

import AdminDashboard from "./components/AdminDashboard";
import UserDashboard from "./components/UserDashboard";
import ProjectsPage from "./components/pages/ProjectsPage";
import TasksPage from "./components/pages/TasksPage";
import ReportsPage from "./components/pages/ReportsPage";
import ChatPage from "./components/pages/ChatPage";
import ManageUsers from "./components/admin/ManageUsers";
import { ChatProvider } from "./context/ChatContext";
import { CallProvider } from "./context/CallContext";
import { useChat } from "./hooks/useChat";
import { useCall } from "./hooks/useCall";
import IncomingCallModal from "./components/chat/IncomingCallModal";
import ActiveCallOverlay from "./components/chat/ActiveCallOverlay";

/** Bridges ChatContext -> CallContext event forwarding */
function CallEventWire() {
  const { callEventHandlerRef } = useChat();
  const { handleCallEventRef } = useCall();

  useEffect(() => {
    callEventHandlerRef.current = (event) => {
      handleCallEventRef.current?.(event);
    };
    return () => {
      callEventHandlerRef.current = null;
    };
  }, [callEventHandlerRef, handleCallEventRef]);

  return null;
}

/** Wraps CallProvider; must be rendered inside ChatProvider */
function CallProviderBridge({ children }) {
  const { wsRef } = useChat();

  return (
    <CallProvider wsRef={wsRef}>
      <CallEventWire />
      {children}
      <IncomingCallModal />
      <ActiveCallOverlay />
    </CallProvider>
  );
}

function App() {
  const { user, authChecking, logout } = useAuth();

  if (authChecking) {
    return <Loading message="Checking your session..." />;
  }

  const isElevated = user?.role === "admin" || user?.role === "superadmin";
  const homePath = user
    ? isElevated
      ? "/admin"
      : "/dashboard"
    : "/login";

  return (
    <ChatProvider>
      <CallProviderBridge>
        <Routes>
          <Route path="/" element={<Navigate to={homePath} replace />} />

          <Route path="/login" element={<AuthForm mode="login" />} />

          <Route path="/forgot-password" element={<AuthForm mode="forgot-password" />} />

          <Route path="/register" element={<Navigate to="/login" replace />} />

          <Route path="/logout" element={<LogoutPage onLogout={logout} />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute role="user">
                <DashboardLayout>
                  <UserDashboard user={user} />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <DashboardLayout>
                  <AdminDashboard user={user} />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute role="admin">
                <DashboardLayout>
                  <ManageUsers />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ProjectsPage user={user} />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <TasksPage user={user} />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ReportsPage user={user} />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ChatPage user={user} />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/chat/:conversationId"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ChatPage user={user} />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to={homePath} replace />} />
        </Routes>
      </CallProviderBridge>
    </ChatProvider>
  );
}

export default App;
