import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import api from "../services/api";

const AuthContext = createContext(null);
const CHANNEL_NAME = "auth-channel";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");

  const authRequestRef = useRef(null);

  const checkAuth = useCallback(() => {
    if (authRequestRef.current) return authRequestRef.current;

    authRequestRef.current = (async () => {
      try {
        const response = await api.get("/auth/me");
        setUser(response.data.user);
        return response.data.user || null;
      } catch (error) {
        if (error.response?.status !== 401) {
          console.error("Session check failed:", error);
        }

        setUser(null);
        return null;
      } finally {
        setAuthChecking(false);
        authRequestRef.current = null;
      }
    })();

    return authRequestRef.current;
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);

    channel.onmessage = async (event) => {
      if (event.data?.type === "logout") {
        setUser(null);
        setAuthError("");
        setAuthSuccess("");
      }

      if (event.data?.type === "login") {
        setAuthError("");
        setAuthSuccess("");
        await checkAuth();
      }
    };

    return () => channel.close();
  }, [checkAuth]);

  const authenticate = useCallback(async (mode, payload) => {
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const response = await api.post(endpoint, payload);

      if (mode === "register") {
        setAuthSuccess("Registration successful. Please log in.");
        return true;
      }

      const authenticatedUser = response.data.user;

      setUser(authenticatedUser);

      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: "login" });
      channel.close();

      return authenticatedUser;
    } catch (error) {
      setAuthError(
        error.response?.data?.message || "Authentication request failed.",
      );

      return false;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);

    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.error("Logout API failed:", error);
      setAuthError(error.response?.data?.message || "Logout request failed.");
    } finally {
      setUser(null);
      setAuthSuccess("");
      setAuthLoading(false);

      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: "logout" });
      channel.close();
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      authChecking,
      authLoading,
      authError,
      authSuccess,
      setAuthError,
      setAuthSuccess,
      checkAuth,
      authenticate,
      logout,
    }),
    [
      user,
      authChecking,
      authLoading,
      authError,
      authSuccess,
      checkAuth,
      authenticate,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
};
