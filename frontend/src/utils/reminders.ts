// Builds the list of "1h before shift" reminders for the next 60 days.
import { api, Workplace } from "@/src/api/client";
import { computeCycleShift, fmtDate, shiftDefaultHours } from "@/src/utils/shifts";

export type ReminderItem = { at: Date; title: string; body: string };

export async function buildReminders(workplaces: Workplace[], days = 60): Promise<ReminderItem[]> {
  const now = new Date();
  const out: ReminderItem[] = [];
  const months = new Set<string>();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    months.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
  }
  for (const wp of workplaces) {
    const overrideList = [] as Awaited<ReturnType<typeof api.listOverrides>>;
    for (const key of months) {
      const [y, m] = key.split("-").map(Number);
      const arr = await api.listOverrides(wp.id, y, m).catch(() => []);
      overrideList.push(...arr);
    }
    const ovMap = new Map(overrideList.map((o) => [o.date, o]));
    for (let i = 0; i < days; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const o = ovMap.get(fmtDate(d));
      const t = o ? o.shift_type : computeCycleShift(d, wp);
      if (t === "FOLGA" || t === "FERIAS") continue;
      const h = o ? { start: o.start_time, end: o.end_time } : shiftDefaultHours(t, wp);
      if (!h.start) continue;
      const [hh, mm] = h.start.split(":").map((v) => parseInt(v, 10));
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
      at.setHours(at.getHours() - 1);
      if (at.getTime() <= now.getTime()) continue;
      out.push({ at, title: `Plantão ${t} em 1h`, body: `${wp.name} • ${h.start} — ${h.end ?? ""}` });
    }
  }
  return out;
}
