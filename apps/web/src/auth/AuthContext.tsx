import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { resolveApiUrl } from "@/apiBase";
import { ACCESS_TOKEN_STORAGE_KEY } from "@/auth/constants";
import type { AuthUser } from "@/types/user";

type AuthContextValue = {
  accessToken: string | null;
  user: AuthUser | null;
  authLoading: boolean;
  setAccessToken: (token: string | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessTokenState] = useState<string | null>(() =>
    localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY),
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(Boolean(accessToken));

  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    if (token) {
      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
  }, []);

  const logout = useCallback(() => {
    setAccessTokenState(null);
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile(): Promise<void> {
      if (!accessToken) {
        setUser(null);
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);
      try {
        const response = await fetch(resolveApiUrl("/api/auth/me"), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          if (!cancelled) {
            setUser(null);
            setAccessTokenState(null);
            localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
          }
          return;
        }

        const body = (await response.json()) as { user: AuthUser };
        if (!cancelled) {
          setUser(body.user);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setAccessTokenState(null);
          localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      user,
      authLoading,
      setAccessToken,
      logout,
    }),
    [accessToken, authLoading, logout, setAccessToken, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
