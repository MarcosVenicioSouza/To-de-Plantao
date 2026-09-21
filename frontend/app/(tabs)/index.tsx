import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { useWorkplaces } from "@/src/contexts/workplaces";
import {
  api,
  ExtraEvent,
  Holiday,
  ShiftOverride,
  Workplace,
  ShiftType,
} from "@/src/api/client";
import {
  fmtDate,
  MONTHS_PT,
  MONTHS_SHORT_PT,
  WEEKDAYS_PT,
  computeCycleShift,
  isOnVacation,
  shiftDefaultHours,
  monthGrid,
  parseISODate,
  buildHolidayMap,
  initialsOf,
  hoursBetween,
  ShiftInfo,
} from "@/src/utils/shifts";
import { EditShiftSheet, EditShiftSheetRef } from "@/src/components/edit-shift-sheet";
import { EventSheet, EventSheetRef } from "@/src/components/event-sheet";
import { DayActionsSheet, DayActionsSheetRef } from "@/src/components/day-actions-sheet";
import { Linking } from "react-native";

type DayEvent =
  | {
      kind: "shift";
      workplace: Workplace;
      info: ShiftInfo;
      label: string;
      color: string;
    }
  | { kind: "extra"; event: ExtraEvent; label: string; color: string }
  | { kind: "holiday"; name: string };

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { workplaces, loading: wpLoading, refresh: refreshWps } = useWorkplaces();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [overridesByWp, setOverridesByWp] = useState<Record<string, ShiftOverride[]>>({});
  const [extraEvents, setExtraEvents] = useState<ExtraEvent[]>([]);
  const [customHolidays, setCustomHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const editRef = useRef<EditShiftSheetRef>(null);
  const eventRef = useRef<EventSheetRef>(null);
  const actionsRef = useRef<DayActionsSheetRef>(null);

  const load = async () => {
    setLoading(true);
    try {
      const ovJobs = workplaces.map((w) =>
        api.listOverrides(w.id, year, month + 1).then((r) => [w.id, r] as const)
      );
      const [ovs, events, holidays] = await Promise.all([
        Promise.all(ovJobs),
        api.listEvents(year, month + 1).catch(() => [] as ExtraEvent[]),
        api.listHolidays().catch(() => [] as Holiday[]),
      ]);
      const map: Record<string, ShiftOverride[]> = {};
      for (const [id, arr] of ovs) map[id] = arr;
      setOverridesByWp(map);
      setExtraEvents(events);
      setCustomHolidays(holidays);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, workplaces.map((w) => w.id).join(",")]);

  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const holidayMap = useMemo(
    () => buildHolidayMap([year, year + 1], customHolidays),
    [year, customHolidays]
  );

  const shiftColorFor = (t: ShiftType, wp: Workplace): string => {
    if (t === "SD") return wp.shift_day_color;
    if (t === "SN") return wp.shift_night_color;
    if (t === "MANHA") return wp.manha_color;
    if (t === "TARDE") return wp.tarde_color;
    if (t === "AVULSO") return wp.avulso_color;
    if (t === "FERIAS") return colors.warning;
    return colors.shiftRest;
  };

  const shiftLabel = (t: ShiftType, wp: Workplace): string => {
    const initials = initialsOf(wp.name);
    if (t === "SD") return `SD ${initials}`;
    if (t === "SN") return `SN ${initials}`;
    if (t === "MANHA") return `Manhã ${initials}`;
    if (t === "TARDE") return `Tarde ${initials}`;
    if (t === "AVULSO") return `Avulso ${initials}`;
    if (t === "FERIAS") return `Férias ${initials}`;
    return "";
  };

  const eventsByDate = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    for (const d of grid) {
      const iso = fmtDate(d);
      const list: DayEvent[] = [];

      const holiday = holidayMap.get(iso);
      if (holiday) list.push({ kind: "holiday", name: holiday });

      for (const wp of workplaces) {
        const ov = (overridesByWp[wp.id] ?? []).find((o) => o.date === iso);
        let info: ShiftInfo;
        if (ov) {
          info = {
            date: iso,
            type: ov.shift_type,
            start_time: ov.start_time,
            end_time: ov.end_time,
            note: ov.note,
            swap_with: ov.swap_with,
            overridden: true,
          };
        } else if (isOnVacation(d, wp)) {
          info = { date: iso, type: "FERIAS", overridden: false };
        } else if (wp.is_avulso_only) {
          info = { date: iso, type: "FOLGA", overridden: false };
        } else {
          const t = computeCycleShift(d, wp);
          const h = shiftDefaultHours(t, wp);
          info = { date: iso, type: t, start_time: h.start, end_time: h.end, overridden: false };
        }
        if (info.type === "FOLGA") continue;
        list.push({
          kind: "shift",
          workplace: wp,
          info,
          label: shiftLabel(info.type, wp),
          color: shiftColorFor(info.type, wp),
        });
      }

      for (const ev of extraEvents.filter((e) => e.date === iso)) {
        list.push({ kind: "extra", event: ev, label: ev.label, color: ev.color });
      }

      if (list.length > 0) map.set(iso, list);
    }
    return map;
  }, [grid, workplaces, overridesByWp, extraEvents, holidayMap, colors]);

  const prevMonth = () =>
    month === 0 ? (setYear(year - 1), setMonth(11)) : setMonth(month - 1);
  const nextMonth = () =>
    month === 11 ? (setYear(year + 1), setMonth(0)) : setMonth(month + 1);

  const shareMonth = async () => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lines: string[] = [];
    lines.push(`📅 *Escala de ${MONTHS_PT[month]}/${year}*`);
    lines.push("");
    let totalHours = 0;
    for (let dnum = 1; dnum <= daysInMonth; dnum++) {
      const d = new Date(year, month, dnum);
      const iso = fmtDate(d);
      const events = eventsByDate.get(iso) ?? [];
      const dow = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getDay()];
      const parts: string[] = [];
      for (const ev of events) {
        if (ev.kind === "holiday") {
          parts.push(`🎉 ${ev.name}`);
        } else if (ev.kind === "shift") {
          const t = ev.info.type;
          const range =
            ev.info.start_time && ev.info.end_time
              ? ` ${ev.info.start_time}-${ev.info.end_time}`
              : "";
          parts.push(`${ev.label}${range}`);
          totalHours += hoursBetween(ev.info.start_time, ev.info.end_time);
        } else if (ev.kind === "extra") {
          const range =
            ev.event.start_time && ev.event.end_time
              ? ` ${ev.event.start_time}-${ev.event.end_time}`
              : "";
          parts.push(`⚡ ${ev.label}${range}`);
          totalHours += hoursBetween(ev.event.start_time, ev.event.end_time);
        }
      }
      const dd = String(dnum).padStart(2, "0");
      if (parts.length === 0) {
        lines.push(`${dd}/${String(month + 1).padStart(2, "0")} (${dow}) — Folga`);
      } else {
        lines.push(`${dd}/${String(month + 1).padStart(2, "0")} (${dow}) — ${parts.join(" | ")}`);
      }
    }
    lines.push("");
    lines.push(`⏱️ *Total:* ${Math.round(totalHours * 10) / 10}h`);
    lines.push("Enviado por EscalaFácil");
    const text = encodeURIComponent(lines.join("\n"));
    const url = `whatsapp://send?text=${text}`;
    const fallback = `https://wa.me/?text=${text}`;
    try {
      const supported = await Linking.canOpenURL(url);
      await Linking.openURL(supported ? url : fallback);
    } catch {
      await Linking.openURL(fallback);
    }
  };

  const openDay = (d: Date) => {
    const iso = fmtDate(d);
    actionsRef.current?.open({
      date: iso,
      workplaces,
      onEditShift: (wp) => {
        const info = pickInfo(d, wp, overridesByWp[wp.id] ?? []);
        editRef.current?.open(iso, info, wp);
      },
      onAddEvent: () => eventRef.current?.open(iso, null),
      onEditEvent: (ev) => eventRef.current?.open(iso, ev),
      events: extraEvents.filter((e) => e.date === iso),
    });
  };

  if (!wpLoading && workplaces.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={40} color={colors.brandPrimary} />
          </View>
          <Text style={styles.emptyTitle}>Configurar minha escala</Text>
          <Text style={styles.emptyBody}>
            Adicione seu primeiro local de trabalho para gerar sua escala mensal automaticamente.
          </Text>
          <Pressable
            testID="empty-add-workplace"
            style={styles.emptyBtn}
            onPress={() => router.push("/(tabs)/locais")}
          >
            <Text style={styles.emptyBtnText}>Adicionar local</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.monthRow}>
          <Pressable testID="prev-month" onPress={prevMonth} style={styles.monthBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.monthLabel} testID="month-label">
            {MONTHS_SHORT_PT[month]} {year}
          </Text>
          <View style={{ flexDirection: "row" }}>
            <Pressable
              testID="share-whatsapp"
              onPress={shareMonth}
              style={styles.monthBtn}
              hitSlop={8}
            >
              <Ionicons name="logo-whatsapp" size={22} color={colors.success} />
            </Pressable>
            <Pressable testID="next-month" onPress={nextMonth} style={styles.monthBtn} hitSlop={8}>
              <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>
        <View style={styles.weekRow}>
          {WEEKDAYS_PT.map((d, i) => (
            <Text
              key={i}
              style={[styles.weekDay, (i === 0 || i === 6) && { color: colors.error }]}
            >
              {d}
            </Text>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 120,
        }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />
        }
      >
        <View style={styles.grid}>
          {grid.map((d, idx) => {
            const iso = fmtDate(d);
            const events = eventsByDate.get(iso) ?? [];
            const inMonth = d.getMonth() === month;
            const isToday = fmtDate(new Date()) === iso;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const startNewRow = idx % 7 === 0;
            return (
              <Pressable
                key={iso}
                testID={`day-${iso}`}
                onPress={() => openDay(d)}
                style={[
                  styles.cell,
                  startNewRow && styles.cellFirst,
                  { opacity: inMonth ? 1 : 0.35 },
                ]}
              >
                <View style={[styles.dayNumWrap, isToday && styles.todayWrap]}>
                  <Text
                    style={[
                      styles.dayNum,
                      isWeekend && { color: colors.error },
                      isToday && { color: colors.onBrandPrimary },
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
                <View style={styles.eventsList}>
                  {events.slice(0, 4).map((ev, i) => {
                    if (ev.kind === "holiday") {
                      return (
                        <View key={`h-${i}`} style={styles.holidayChip}>
                          <Text style={styles.holidayText} numberOfLines={2}>
                            {ev.name}
                          </Text>
                        </View>
                      );
                    }
                    return (
                      <View key={`e-${i}`} style={styles.eventRow}>
                        <View style={[styles.eventBar, { backgroundColor: ev.color }]} />
                        <Text style={styles.eventLabel} numberOfLines={1}>
                          {ev.label}
                        </Text>
                      </View>
                    );
                  })}
                  {events.length > 4 ? (
                    <Text style={styles.moreText}>+{events.length - 4}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Pressable
        testID="add-random-event"
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => eventRef.current?.open(fmtDate(new Date()), null)}
      >
        <Ionicons name="flash" size={22} color={colors.onBrandPrimary} />
        <Text style={styles.fabText}>Plantão aleatório</Text>
      </Pressable>

      <EditShiftSheet ref={editRef} onSaved={load} />
      <EventSheet ref={eventRef} onSaved={load} />
      <DayActionsSheet ref={actionsRef} />
    </View>
  );
}

function pickInfo(d: Date, wp: Workplace, overrides: ShiftOverride[]): ShiftInfo {
  const iso = fmtDate(d);
  const ov = overrides.find((o) => o.date === iso);
  if (ov) {
    return {
      date: iso,
      type: ov.shift_type,
      start_time: ov.start_time,
      end_time: ov.end_time,
      note: ov.note,
      swap_with: ov.swap_with,
      overridden: true,
    };
  }
  if (isOnVacation(d, wp)) return { date: iso, type: "FERIAS", overridden: false };
  if (wp.is_avulso_only) return { date: iso, type: "FOLGA", overridden: false };
  const t = computeCycleShift(d, wp);
  const h = shiftDefaultHours(t, wp);
  return { date: iso, type: t, start_time: h.start, end_time: h.end, overridden: false };
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  weekRow: { flexDirection: "row", marginTop: spacing.xs },
  weekDay: {
    flex: 1,
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: `${100 / 7}%`,
    minHeight: 92,
    paddingHorizontal: 3,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cellFirst: {},
  dayNumWrap: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  todayWrap: { backgroundColor: colors.brandPrimary },
  dayNum: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  eventsList: { marginTop: 2, gap: 2 },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  eventBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  eventLabel: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 10,
    fontWeight: "600",
  },
  holidayChip: {
    backgroundColor: "rgba(52,199,89,0.18)",
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  holidayText: {
    color: colors.success,
    fontSize: 10,
    fontWeight: "700",
  },
  moreText: { color: colors.muted, fontSize: 10, fontWeight: "600", marginTop: 1 },

  fab: {
    position: "absolute",
    right: spacing.lg,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { color: colors.onBrandPrimary, fontWeight: "700" },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  emptyBody: {
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.sm,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  emptyBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },
}));
