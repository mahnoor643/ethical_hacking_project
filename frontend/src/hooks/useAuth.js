import { useCallback, useEffect, useState } from "react";
import { AUTH_REQUIRED_EVENT, getSession, login as apiLogin, logout as apiLogout } from "../services/api.js";

// Session state for the whole app. The real check is always on the
// server: this only decides whether to show the login screen.
// status: "checking" | "authenticated" | "anonymous" | "error"
export default function useAuth() {
  const [status, setStatus] = useState("checking");
  const [configured, setConfigured] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getSession();
      setConfigured(data.configured !== false);
      setStatus(data.authenticated ? "authenticated" : "anonymous");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    refresh();
    const onExpired = () => setStatus("anonymous");
    window.addEventListener(AUTH_REQUIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onExpired);
  }, [refresh]);

  const login = useCallback(async (code) => {
    await apiLogin(code);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setStatus("anonymous");
    }
  }, []);

  return { status, configured, login, logout, refresh };
}
