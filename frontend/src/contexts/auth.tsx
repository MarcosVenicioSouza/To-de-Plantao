import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, tokenStore, User } from "@/src/api/client";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
      await tokenStore.remove();
    }
  }, []);

  useEffect(() => {
    (async () => {
      const t = await tokenStore.get();
      if (t) await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    await tokenStore.set(r.access_token);
    const me = await api.me();
    setUser(me);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const r = await api.register(name, email, password);
    await tokenStore.set(r.access_token);
    const me = await api.me();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await tokenStore.remove();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
