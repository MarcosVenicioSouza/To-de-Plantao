import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, Workplace } from "@/src/api/client";
import { useAuth } from "@/src/contexts/auth";

type WorkplacesState = {
  loading: boolean;
  workplaces: Workplace[];
  currentId: string | null;
  current: Workplace | null;
  setCurrentId: (id: string | null) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<WorkplacesState | null>(null);
const KEY = "escala_current_workplace";

export function WorkplacesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [currentId, setCurrentIdRaw] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setCurrentId = useCallback((id: string | null) => {
    setCurrentIdRaw(id);
    if (id) AsyncStorage.setItem(KEY, id);
    else AsyncStorage.removeItem(KEY);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setWorkplaces([]);
      setCurrentIdRaw(null);
      return;
    }
    setLoading(true);
    try {
      const list = await api.listWorkplaces();
      setWorkplaces(list);
      const stored = await AsyncStorage.getItem(KEY);
      const valid = stored && list.some((w) => w.id === stored) ? stored : list[0]?.id ?? null;
      setCurrentIdRaw(valid);
      if (valid) AsyncStorage.setItem(KEY, valid);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const current = workplaces.find((w) => w.id === currentId) ?? null;

  return (
    <Ctx.Provider value={{ loading, workplaces, currentId, current, setCurrentId, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWorkplaces() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkplaces outside provider");
  return v;
}
