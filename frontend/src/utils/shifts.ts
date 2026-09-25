// Shift cycle + date helpers with BR (DD/MM/YYYY) formatting.
import { CyclePattern, ShiftType, Workplace, ShiftOverride } from "@/src/api/client";

export type ShiftInfo = {
  date: string;
  type: ShiftType;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
  swap_with?: string | null;
  overridden: boolean;
};

// Cycle patterns: index -> ShiftType relative to first working shift.
// "first" and "opposite" are resolved by wp.cycle_start_shift (SD or SN).
type Slot = "FIRST" | "OPPOSITE" | "FOLGA";
export const CYCLE_PATTERNS: Record<CyclePattern, Slot[]> = {
  // SD Folga SN Saída Folga (5 dias, 36h/sem)
  SD_F_SN_F_F: ["FIRST", "FOLGA", "OPPOSITE", "FOLGA", "FOLGA"],
  // SD SN Saída Folga Folga (5 dias, 36h/sem)
  SD_SN_F_F_F: ["FIRST", "OPPOSITE", "FOLGA", "FOLGA", "FOLGA"],
  // SD SN Saída Folga (4 dias, 44h/sem)
  SD_SN_F_F: ["FIRST", "OPPOSITE", "FOLGA", "FOLGA"],
  // SD Folga Folga SN Saída Folga (6 dias, 30h/sem)
  SD_F_F_SN_F_F: ["FIRST", "FOLGA", "FOLGA", "OPPOSITE", "FOLGA", "FOLGA"],
  // SD Folga Folga SD Folga Folga (6 dias, 30h/sem)
  SD_F_F_SD_F_F: ["FIRST", "FOLGA", "FOLGA", "FIRST", "FOLGA", "FOLGA"],
  // Legacy 12x36
  SD_F_SN_F: ["FIRST", "FOLGA", "OPPOSITE", "FOLGA"],
};

export const CYCLE_LABELS: Record<CyclePattern, string> = {
  SD_F_SN_F_F: "36h = SD → Folga → SN → Saída → Folga",
  SD_SN_F_F_F: "36h = SD → SN → Saída → Folga → Folga",
  SD_SN_F_F: "44h = SD → SN → Saída → Folga",
  SD_F_F_SN_F_F: "30h = SD → Folga → Folga → SN → Saída → Folga",
  SD_F_F_SD_F_F: "30h = SD → Folga → Folga → SD → Folga → Folga",
  SD_F_SN_F: "12x36 = SD → Folga → SN → Folga",
};

// Order to render in the workplace form; note SD_F_SN_F (legacy) is intentionally last.
export const CYCLE_ORDER: CyclePattern[] = [
  "SD_F_SN_F_F",
  "SD_SN_F_F_F",
  "SD_SN_F_F",
  "SD_F_F_SN_F_F",
  "SD_F_F_SD_F_F",
  "SD_F_SN_F",
];

// -------- date helpers --------
export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

// Convert ISO YYYY-MM-DD -> BR DD/MM/YYYY
export function isoToBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Convert BR DD/MM/YYYY -> ISO YYYY-MM-DD (returns "" if invalid)
export function brToISO(br: string): string {
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function daysBetween(a: Date, b: Date): number {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((B - A) / 86400000);
}

// -------- cycle logic --------
export function computeCycleShift(date: Date, wp: Workplace): ShiftType {
  const pattern = CYCLE_PATTERNS[wp.cycle_pattern] ?? CYCLE_PATTERNS.SD_F_SN_F_F;
  const start = parseISODate(wp.cycle_start_date);
  const repeat = wp.cycle_repeat_months;
  if (repeat && repeat > 0) {
    const end = new Date(start.getFullYear(), start.getMonth() + repeat, start.getDate());
    if (date >= end || date < start) return "FOLGA";
  }
  const diff = daysBetween(start, date);
  const pos = ((diff % pattern.length) + pattern.length) % pattern.length;
  const slot = pattern[pos];
  if (slot === "FOLGA") return "FOLGA";
  const first = wp.cycle_start_shift;
  const opposite: ShiftType = first === "SD" ? "SN" : "SD";
  return slot === "FIRST" ? first : opposite;
}

export function isOnVacation(date: Date, wp: Workplace): boolean {
  const iso = fmtDate(date);
  return (wp.vacations ?? []).some((v) => iso >= v.start && iso <= v.end);
}

export function shiftDefaultHours(
  type: ShiftType,
  wp: Workplace
): { start: string | null; end: string | null } {
  if (type === "SD") return { start: wp.sd_start, end: wp.sd_end };
  if (type === "SN") return { start: wp.sn_start, end: wp.sn_end };
  if (type === "MANHA") return { start: "07:00", end: "13:00" };
  if (type === "TARDE") return { start: "13:00", end: "19:00" };
  return { start: null, end: null };
}

export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(year, month, 1 - startOffset + i));
  }
  return days;
}

export function mergeShifts(
  dates: Date[],
  wp: Workplace,
  overrides: ShiftOverride[]
): Record<string, ShiftInfo> {
  const ovMap = new Map(overrides.map((o) => [o.date, o]));
  const out: Record<string, ShiftInfo> = {};
  for (const d of dates) {
    const iso = fmtDate(d);
    const o = ovMap.get(iso);
    if (o) {
      out[iso] = {
        date: iso,
        type: o.shift_type,
        start_time: o.start_time,
        end_time: o.end_time,
        note: o.note,
        swap_with: o.swap_with,
        overridden: true,
      };
      continue;
    }
    // vacation window overrides cycle
    if (isOnVacation(d, wp)) {
      out[iso] = { date: iso, type: "FERIAS", overridden: false };
      continue;
    }
    // avulso-only workplaces show all days as FOLGA (no cycle); user marks specific days as AVULSO
    if (wp.is_avulso_only) {
      out[iso] = { date: iso, type: "FOLGA", overridden: false };
      continue;
    }
    const t = computeCycleShift(d, wp);
    const h = shiftDefaultHours(t, wp);
    out[iso] = {
      date: iso,
      type: t,
      start_time: h.start,
      end_time: h.end,
      overridden: false,
    };
  }
  return out;
}

export function hoursBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map((v) => parseInt(v, 10));
  const [eh, em] = end.split(":").map((v) => parseInt(v, 10));
  if ([sh, sm, eh, em].some((x) => Number.isNaN(x))) return 0;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

export function monthlyReport(
  year: number,
  month: number,
  wp: Workplace,
  overrides: ShiftOverride[]
) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates: Date[] = [];
  for (let d = 1; d <= daysInMonth; d++) dates.push(new Date(year, month, d));
  const map = mergeShifts(dates, wp, overrides);
  let sd = 0, sn = 0, folga = 0, avulso = 0, ferias = 0, manha = 0, tarde = 0, hours = 0;
  for (const d of dates) {
    const info = map[fmtDate(d)];
    if (info.type === "SD") {
      sd++;
      hours += hoursBetween(info.start_time || wp.sd_start, info.end_time || wp.sd_end);
    } else if (info.type === "SN") {
      sn++;
      hours += hoursBetween(info.start_time || wp.sn_start, info.end_time || wp.sn_end);
    } else if (info.type === "MANHA") {
      manha++;
      hours += hoursBetween(info.start_time || "07:00", info.end_time || "13:00");
    } else if (info.type === "TARDE") {
      tarde++;
      hours += hoursBetween(info.start_time || "13:00", info.end_time || "19:00");
    } else if (info.type === "AVULSO") {
      avulso++;
      hours += hoursBetween(info.start_time, info.end_time);
    } else if (info.type === "FERIAS") {
      ferias++;
    } else folga++;
  }
  return { sd, sn, manha, tarde, folga, avulso, ferias, hours: Math.round(hours * 10) / 10 };
}

export const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const WEEKDAYS_PT = ["D", "S", "T", "Q", "Q", "S", "S"];

// -------- Brazilian national holidays --------
// Fixed holidays (national); movable ones computed via Easter.
function easterDate(year: number): Date {
  // Meeus / Butcher algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function brazilianHolidays(year: number): { date: string; name: string }[] {
  const easter = easterDate(year);
  const carnaval = addDays(easter, -47);
  const carnaval2 = addDays(easter, -46);
  const paixao = addDays(easter, -2);
  const corpus = addDays(easter, 60);
  const fixed = [
    { m: 0, d: 1, name: "Confraternização Universal" },
    { m: 3, d: 21, name: "Tiradentes" },
    { m: 4, d: 1, name: "Dia do Trabalho" },
    { m: 8, d: 7, name: "Independência" },
    { m: 9, d: 12, name: "Nossa Sra. Aparecida" },
    { m: 10, d: 2, name: "Finados" },
    { m: 10, d: 15, name: "Proclamação da República" },
    { m: 10, d: 20, name: "Consciência Negra" },
    { m: 11, d: 25, name: "Natal" },
  ];
  const list = fixed.map((f) => ({
    date: fmtDate(new Date(year, f.m, f.d)),
    name: f.name,
  }));
  list.push({ date: fmtDate(carnaval), name: "Carnaval" });
  list.push({ date: fmtDate(carnaval2), name: "Carnaval" });
  list.push({ date: fmtDate(paixao), name: "Sexta-feira Santa" });
  list.push({ date: fmtDate(easter), name: "Páscoa" });
  list.push({ date: fmtDate(corpus), name: "Corpus Christi" });
  return list;
}

export function buildHolidayMap(
  years: number[],
  custom: { date: string; name: string }[]
): Map<string, string> {
  const m = new Map<string, string>();
  for (const y of years) {
    for (const h of brazilianHolidays(y)) {
      if (!m.has(h.date)) m.set(h.date, h.name);
    }
  }
  for (const h of custom) m.set(h.date, h.name);
  return m;
}

export function initialsOf(name: string): string {
  const skip = new Set([
    "de", "da", "das", "do", "dos", "e",
    "the", "of", "and",
  ]);
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w && !skip.has(w.toLowerCase()));
  if (words.length === 0) {
    const first = name.trim().split(/\s+/)[0] ?? "?";
    return first.slice(0, 2).toUpperCase();
  }
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export const MONTHS_SHORT_PT = [
  "Jan.", "Fev.", "Mar.", "Abr.", "Mai.", "Jun.",
  "Jul.", "Ago.", "Set.", "Out.", "Nov.", "Dez.",
];
