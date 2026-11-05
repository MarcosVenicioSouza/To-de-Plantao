// Supabase-backed data client for Tô de Plantão.
// Keeps the same function names used throughout the app.
import { supabase } from "@/src/lib/supabase";

export type CyclePattern =
  | "SD_F_SN_F_F"
  | "SD_SN_F_F_F"
  | "SD_SN_F_F"
  | "SD_F_F_SN_F_F"
  | "SD_F_F_SD_F_F"
  | "SD_F_SN_F";
export type VacationPeriod = { start: string; end: string };

export type Workplace = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  cycle_pattern: CyclePattern;
  cycle_start_date: string;
  cycle_start_shift: "SD" | "SN";
  cycle_repeat_months?: number | null;
  sd_start: string;
  sd_end: string;
  sn_start: string;
  sn_end: string;
  shift_day_color: string;
  shift_night_color: string;
  avulso_color: string;
  manha_color: string;
  tarde_color: string;
  is_avulso_only: boolean;
  vacations: VacationPeriod[];
  created_at: string;
};

export type ShiftType = "SD" | "SN" | "FOLGA" | "AVULSO" | "FERIAS" | "MANHA" | "TARDE";

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
export type ExtraEvent = {
  id: string;
  user_id: string;
  date: string;
  label: string;
  color: string;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
  created_at: string;
};
export type User = { id: string; name: string; email: string };

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Não autenticado");
  return data.user.id;
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  const start = `${year}-${mm}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, end };
}

function unwrap<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw new Error(res.error.message ?? "Erro no banco");
  if (res.data === null) throw new Error("Sem dados");
  return res.data;
}

export const api = {
  // ---- Workplaces ----
  listWorkplaces: async (): Promise<Workplace[]> => {
    const uid = await currentUserId();
    const res = await supabase
      .from("workplaces")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });
    return unwrap(res) ?? [];
  },
  createWorkplace: async (body: Partial<Workplace>): Promise<Workplace> => {
    const uid = await currentUserId();
    const payload: any = { ...body, user_id: uid };
    delete payload.id;
    delete payload.created_at;
    const res = await supabase.from("workplaces").insert(payload).select().single();
    return unwrap(res);
  },
  updateWorkplace: async (id: string, body: Partial<Workplace>): Promise<Workplace> => {
    const payload: any = { ...body };
    delete payload.id;
    delete payload.user_id;
    delete payload.created_at;
    const res = await supabase
      .from("workplaces")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    return unwrap(res);
  },
  deleteWorkplace: async (id: string): Promise<void> => {
    const res = await supabase.from("workplaces").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
  },

  // ---- Shift overrides ----
  listOverrides: async (
    wid: string,
    year: number,
    month: number
  ): Promise<ShiftOverride[]> => {
    const uid = await currentUserId();
    const { start, end } = monthRange(year, month);
    const res = await supabase
      .from("shift_overrides")
      .select("*")
      .eq("user_id", uid)
      .eq("workplace_id", wid)
      .gte("date", start)
      .lt("date", end);
    return unwrap(res) ?? [];
  },
  saveOverride: async (
    wid: string,
    date: string,
    body: Partial<ShiftOverride>
  ): Promise<ShiftOverride> => {
    const uid = await currentUserId();
    const payload: any = {
      user_id: uid,
      workplace_id: wid,
      date,
      shift_type: body.shift_type,
      start_time: body.start_time ?? null,
      end_time: body.end_time ?? null,
      note: body.note ?? null,
      swap_with: body.swap_with ?? null,
      updated_at: new Date().toISOString(),
    };
    const res = await supabase
      .from("shift_overrides")
      .upsert(payload, { onConflict: "user_id,workplace_id,date" })
      .select()
      .single();
    return unwrap(res);
  },
  deleteOverride: async (wid: string, date: string): Promise<void> => {
    const uid = await currentUserId();
    const res = await supabase
      .from("shift_overrides")
      .delete()
      .eq("user_id", uid)
      .eq("workplace_id", wid)
      .eq("date", date);
    if (res.error) throw new Error(res.error.message);
  },

  // ---- Holidays ----
  listHolidays: async (): Promise<Holiday[]> => {
    const uid = await currentUserId();
    const res = await supabase
      .from("holidays")
      .select("*")
      .eq("user_id", uid)
      .order("date", { ascending: true });
    return unwrap(res) ?? [];
  },
  createHoliday: async (date: string, name: string): Promise<Holiday> => {
    const uid = await currentUserId();
    const res = await supabase
      .from("holidays")
      .insert({ user_id: uid, date, name })
      .select()
      .single();
    return unwrap(res);
  },
  deleteHoliday: async (id: string): Promise<void> => {
    const res = await supabase.from("holidays").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
  },

  // ---- Extra events ----
  listEvents: async (year: number, month: number): Promise<ExtraEvent[]> => {
    const uid = await currentUserId();
    const { start, end } = monthRange(year, month);
    const res = await supabase
      .from("extra_events")
      .select("*")
      .eq("user_id", uid)
      .gte("date", start)
      .lt("date", end)
      .order("date", { ascending: true });
    return unwrap(res) ?? [];
  },
  createEvent: async (body: Partial<ExtraEvent>): Promise<ExtraEvent> => {
    const uid = await currentUserId();
    const payload: any = { ...body, user_id: uid };
    delete payload.id;
    delete payload.created_at;
    const res = await supabase.from("extra_events").insert(payload).select().single();
    return unwrap(res);
  },
  updateEvent: async (id: string, body: Partial<ExtraEvent>): Promise<ExtraEvent> => {
    const payload: any = { ...body };
    delete payload.id;
    delete payload.user_id;
    delete payload.created_at;
    const res = await supabase
      .from("extra_events")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    return unwrap(res);
  },
  deleteEvent: async (id: string): Promise<void> => {
    const res = await supabase.from("extra_events").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
  },

  // ---- Account self-delete (wipes own rows; auth row removed by admin) ----
  deleteMe: async (): Promise<void> => {
    const uid = await currentUserId();
    await supabase.from("extra_events").delete().eq("user_id", uid);
    await supabase.from("shift_overrides").delete().eq("user_id", uid);
    await supabase.from("holidays").delete().eq("user_id", uid);
    await supabase.from("workplaces").delete().eq("user_id", uid);
    await supabase.auth.signOut();
  },
};
