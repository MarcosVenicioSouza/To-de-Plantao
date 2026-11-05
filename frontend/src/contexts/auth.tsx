import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabase";

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  is_admin: boolean;
  is_blocked: boolean;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

async function loadProfile(userId: string, email: string): Promise<AuthUser> {
  const { data } = await supabase
    .from("profiles")
    .select("id,email,display_name,is_admin,is_blocked")
    .eq("id", userId)
    .maybeSingle();
  return {
    id: userId,
    email: data?.email ?? email,
    name: data?.display_name ?? undefined,
    is_admin: !!data?.is_admin,
    is_blocked: !!data?.is_blocked,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setUser(null);
      return;
    }
    const profile = await loadProfile(data.user.id, data.user.email ?? "");
    if (profile.is_blocked) {
      await supabase.auth.signOut();
      setUser(null);
      throw new Error("Sua conta está bloqueada. Fale com o administrador.");
    }
    setUser(profile);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch {
        // ignore; initial session restore errors just leave user null
      } finally {
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setUser(null);
        return;
      }
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        try {
          const profile = await loadProfile(session.user.id, session.user.email ?? "");
          if (profile.is_blocked) {
            await supabase.auth.signOut();
            setUser(null);
          } else {
            setUser(profile);
          }
        } catch {
          /* noop */
        }
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      const msg = /invalid/i.test(error.message)
        ? "E-mail ou senha incorretos"
        : error.message;
      throw new Error(msg);
    }
    if (!data.user) throw new Error("Falha ao entrar");
    const profile = await loadProfile(data.user.id, data.user.email ?? "");
    if (profile.is_blocked) {
      await supabase.auth.signOut();
      throw new Error("Sua conta está bloqueada. Fale com o administrador.");
    }
    setUser(profile);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    if (newPassword.length < 8)
      throw new Error("A senha precisa ter pelo menos 8 caracteres");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh, changePassword }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
