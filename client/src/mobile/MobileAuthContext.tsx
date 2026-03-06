import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export type MobileUser = {
  id: number;
  name: string | null;
  email: string | null;
  role: "user" | "admin" | "operator";
};

type MobileAuthContextType = {
  serverUrl: string;
  setServerUrl: (url: string) => void;
  token: string | null;
  user: MobileUser | null;
  login: (token: string, user: MobileUser) => void;
  logout: () => void;
  isConfigured: boolean;
  isAuthenticated: boolean;
};

const MobileAuthContext = createContext<MobileAuthContextType | null>(null);

const SERVER_URL_KEY = "fiberdoc_mobile_server_url";
const TOKEN_KEY = "fiberdoc_mobile_token";
const USER_KEY = "fiberdoc_mobile_user";

export function MobileAuthProvider({ children }: { children: ReactNode }) {
  const [serverUrl, setServerUrlState] = useState<string>(() =>
    localStorage.getItem(SERVER_URL_KEY) ?? ""
  );
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );
  const [user, setUser] = useState<MobileUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  const setServerUrl = useCallback((url: string) => {
    const clean = url.replace(/\/$/, "");
    localStorage.setItem(SERVER_URL_KEY, clean);
    setServerUrlState(clean);
  }, []);

  const login = useCallback((newToken: string, newUser: MobileUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <MobileAuthContext.Provider
      value={{
        serverUrl,
        setServerUrl,
        token,
        user,
        login,
        logout,
        isConfigured: serverUrl.length > 0,
        isAuthenticated: !!token && !!user,
      }}
    >
      {children}
    </MobileAuthContext.Provider>
  );
}

export function useMobileAuth() {
  const ctx = useContext(MobileAuthContext);
  if (!ctx) throw new Error("useMobileAuth must be used within MobileAuthProvider");
  return ctx;
}
