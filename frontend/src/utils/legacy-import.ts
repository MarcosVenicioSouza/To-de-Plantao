// Imports the user's data from the old database (matched by e-mail) into Supabase.
import { supabase } from "@/src/lib/supabase";
import { backendFetch } from "@/src/utils/backend";

type LegacyExport = {
  found: boolean;
  workplaces: any[];
  shift_overrides: any[];
  holidays: any[];
  extra_events: any[];
};

export type ImportResult = { found: boolean; workplaces: number; shifts: number; holidays: number; events: number };

async function upsert(table: string, rows: any[], onConflict: string) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(error.message);
}

export async function importLegacyData(): Promise<ImportResult> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Não autenticado");
  const exp = await backendFetch<LegacyExport>("/legacy/export");
  const own = (r: any) => ({ ...r, user_id: uid });

  await upsert("workplaces", exp.workplaces.map(own), "id");
  const wpIds = new Set(exp.workplaces.map((w) => w.id));
  const shifts = exp.shift_overrides.filter((s) => wpIds.has(s.workplace_id)).map(own);
  await upsert("shift_overrides", shifts, "user_id,workplace_id,date");
  await upsert(
    "holidays",
    exp.holidays.map((h) => ({ id: h.id, date: h.date, name: h.name, user_id: uid })),
    "user_id,date"
  );
  await upsert("extra_events", exp.extra_events.map(own), "id");

  return {
    found: exp.found,
    workplaces: exp.workplaces.length,
    shifts: shifts.length,
    holidays: exp.holidays.length,
    events: exp.extra_events.length,
  };
}
