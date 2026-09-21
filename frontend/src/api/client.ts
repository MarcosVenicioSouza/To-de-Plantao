// API client for EscalaFácil backend.
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const RAW = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
export const API_BASE = `${RAW.replace(/\/$/, "")}/api`;

const TOKEN_KEY = "escala_token";

const storage = {
  async get(): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async set(v: string) {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(TOKEN_KEY, v);
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, v);
  },
  async remove() {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(TOKEN_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

export const tokenStore = storage;

export type CyclePattern = "SD_F_SN_F_F" | "SD_SN_F_F" | "SD_F_SN_F";
export type VacationPeriod = { start: string; end: string };

export type Workplace = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  cycle_pattern: CyclePattern;
  cycle_start_date: string;
  cycle_start_shift: "SD" | "SN";
  sd_start: string;
  sd_end: string;
  sn_start: string;
  sn_end: string;
  shift_day_color: string;
  shift_night_color: string;
  avulso_color: string;
  is_avulso_only: boolean;
  vacations: VacationPeriod[];
  created_at: string;
};

export type ShiftType = "SD" | "SN" | "FOLGA" | "AVULSO" | "FERIAS";

export type ShiftOverride = {
  id: string;
  user_id: string;
  workplace_id: string;
  date: string;
  shift_type: ShiftType;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
  swap_with?: string | null;
  updated_at: string;
};

export type Holiday = { id: string; user_id: string; date: string; name: string };
export type User = { id: string; name: string; email: string };

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await storage.get();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const r = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await r.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
  if (!r.ok) {
    const msg = (data && (data.detail || data.message)) || `Erro ${r.status}`;
    throw new Error(typeof msg === "string" ? msg : "Erro na requisição");
  }
  return data as T;
}

export const api = {
  register: (name: string, email: string, password: string) =>
    req<{ access_token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    req<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => req<User>("/auth/me"),

  listWorkplaces: () => req<Workplace[]>("/workplaces"),
  createWorkplace: (b: Partial<Workplace>) =>
    req<Workplace>("/workplaces", { method: "POST", body: JSON.stringify(b) }),
  updateWorkplace: (id: string, b: Partial<Workplace>) =>
    req<Workplace>(`/workplaces/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteWorkplace: (id: string) =>
    req<void>(`/workplaces/${id}`, { method: "DELETE" }),

  listOverrides: (wid: string, year: number, month: number) =>
    req<ShiftOverride[]>(`/shifts/${wid}?year=${year}&month=${month}`),
  saveOverride: (wid: string, date: string, body: Partial<ShiftOverride>) =>
    req<ShiftOverride>(`/shifts/${wid}/${date}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteOverride: (wid: string, date: string) =>
    req<void>(`/shifts/${wid}/${date}`, { method: "DELETE" }),

  listHolidays: () => req<Holiday[]>("/holidays"),
  createHoliday: (date: string, name: string) =>
    req<Holiday>("/holidays", { method: "POST", body: JSON.stringify({ date, name }) }),
  deleteHoliday: (id: string) => req<void>(`/holidays/${id}`, { method: "DELETE" }),
};
