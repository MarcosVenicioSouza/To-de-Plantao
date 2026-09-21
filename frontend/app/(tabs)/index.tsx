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
import { api, ShiftOverride, Workplace, ShiftType, Holiday } from "@/src/api/client";
import {
  fmtDate,
  MONTHS_PT,
  WEEKDAYS_PT,
  mergeShifts,
  monthGrid,
  parseISODate,
  buildHolidayMap,
  ShiftInfo,
} from "@/src/utils/shifts";
import { EditShiftSheet, EditShiftSheetRef } from "@/src/components/edit-shift-sheet";
import { WorkplacePicker } from "@/src/components/workplace-picker";

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { workplaces, current, loading: wpLoading, setCurrentId } = useWorkplaces();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [overrides, setOverrides] = useState<ShiftOverride[]>([]);
  const [overrides2, setOverrides2] = useState<ShiftOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<"primary" | "secondary" | null>(null);
  const [secondaryId, setSecondaryId] = useState<string | null>(null);
  const [customHolidays, setCustomHolidays] = useState<Holiday[]>([]);
  const [sheetTarget, setSheetTarget] = useState<Workplace | null>(null);
  const sheetRef = useRef<EditShiftSheetRef>(null);

  const secondary = useMemo(
    () => workplaces.find((w) => w.id === secondaryId) ?? null,
    [workplaces, secondaryId]
  );

  const load = async () => {
    const jobs: Promise<any>[] = [];
    if (current) jobs.push(api.listOverrides(current.id, year, month + 1));
    else jobs.push(Promise.resolve([]));
    if (secondary) jobs.push(api.listOverrides(secondary.id, year, month + 1));
    else jobs.push(Promise.resolve([]));
    jobs.push(api.listHolidays().catch(() => [] as Holiday[]));

    setLoading(true);
    try {
      const [a, b, holidays] = await Promise.all(jobs);
      setOverrides(a as ShiftOverride[]);
      setOverrides2(b as ShiftOverride[]);
      setCustomHolidays(holidays as Holiday[]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, secondary?.id, year, month]);

  const grid = useMemo(() => monthGrid(year, month), [year, month]);

  const shiftMap = useMemo(() => {
    if (!current) return {} as Record<string, ShiftInfo>;
    return mergeShifts(grid, current, overrides);
  }, [grid, current, overrides]);

  const shiftMap2 = useMemo(() => {
    if (!secondary) return {} as Record<string, ShiftInfo>;
    return mergeShifts(grid, secondary, overrides2);
  }, [grid, secondary, overrides2]);

  const holidayMap = useMemo(
    () => buildHolidayMap([year, year + 1], customHolidays),
    [year, customHolidays]
  );

  const nextShift = useMemo(() => {
    if (!current) return null;
    const t = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
      const iso = fmtDate(d);
      const info = mergeShifts([d], current, overrides)[iso];
      if (info.type === "SD" || info.type === "SN" || info.type === "AVULSO") return info;
    }
    return null;
  }, [current, overrides]);

  const prevMonth = () => (month === 0 ? (setYear(year - 1), setMonth(11)) : setMonth(month - 1));
  const nextMonth = () => (month === 11 ? (setYear(year + 1), setMonth(0)) : setMonth(month + 1));

  const openDay = (date: Date, targetWp: Workplace | null) => {
    if (!targetWp) return;
    const iso = fmtDate(date);
    const map = targetWp.id === current?.id ? shiftMap : shiftMap2;
    const info = map[iso];
    if (!info) return;
    setSheetTarget(targetWp);
    sheetRef.current?.open(iso, info, targetWp);
  };

  const shiftColor = (t: ShiftType, wp: Workplace | null) => {
    if (!wp) return colors.shiftRest;
    if (t === "SD") return wp.shift_day_color;
    if (t === "SN") return wp.shift_night_color;
    if (t === "AVULSO") return wp.avulso_color;
    if (t === "FERIAS") return colors.warning;
    return colors.shiftRest;
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

  const canShowSecondary = workplaces.length >= 2;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.wpRow}>
          <Pressable
            testID="workplace-selector"
            style={[styles.wpSelector, { flex: 1 }]}
            onPress={() => setPickerOpen("primary")}
          >
            <View style={[styles.wpDot, { backgroundColor: current?.color ?? colors.brandPrimary }]} />
            <Text style={styles.wpName} numberOfLines={1}>
              {current?.name ?? "Selecione um local"}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.onSurface} />
          </Pressable>
          {canShowSecondary ? (
            <Pressable
              testID="workplace-selector-2"
              style={[styles.wpSelector, secondary && styles.wpSelectorActive]}
              onPress={() => setPickerOpen("secondary")}
            >
              {secondary ? (
                <>
                  <View style={[styles.wpDot, { backgroundColor: secondary.color }]} />
                  <Text style={styles.wpName} numberOfLines={1}>
                    {secondary.name}
                  </Text>
                  <Pressable
                    onPress={() => setSecondaryId(null)}
                    hitSlop={8}
                    testID="clear-secondary"
                  >
                    <Ionicons name="close" size={16} color={colors.onSurface} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Ionicons name="add" size={16} color={colors.brandPrimary} />
                  <Text style={[styles.wpName, { color: colors.brandPrimary }]}>2º local</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>

        <View style={styles.monthRow}>
          <Pressable testID="prev-month" onPress={prevMonth} style={styles.monthBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.monthLabel} testID="month-label">
            {MONTHS_PT[month]} {year}
          </Text>
          <Pressable testID="next-month" onPress={nextMonth} style={styles.monthBtn} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS_PT.map((d, i) => (
            <Text
              key={i}
              style={[
                styles.weekDay,
                (i === 0 || i === 6) && { color: colors.error },
              ]}
            >
              {d}
            </Text>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />
        }
      >
        <View style={styles.grid}>
          {grid.map((d) => {
            const iso = fmtDate(d);
            const info = shiftMap[iso];
            const info2 = shiftMap2[iso];
            const inMonth = d.getMonth() === month;
            const isToday = fmtDate(new Date()) === iso;
            const holiday = holidayMap.get(iso);
            const primaryWork = info && info.type !== "FOLGA";
            const secondaryWork = info2 && info2.type !== "FOLGA";

            const primaryBg = info ? shiftColor(info.type, current) : "transparent";
            const secondaryBg = info2 ? shiftColor(info2.type, secondary) : "transparent";
            const splitMode = !!(secondary && (primaryWork || secondaryWork));

            return (
              <Pressable
                key={iso}
                testID={`day-${iso}`}
                onPress={() => openDay(d, current)}
                onLongPress={() => secondary && openDay(d, secondary)}
                style={[
                  styles.cell,
                  { opacity: inMonth ? 1 : 0.35 },
                ]}
              >
                <View
                  style={[
                    styles.cellFill,
                    isToday && { borderColor: colors.brandPrimary, borderWidth: 2 },
                    holiday && !isToday && { borderColor: colors.warning, borderWidth: 1 },
                  ]}
                >
                  {/* Backgrounds */}
                  {splitMode ? (
                    <>
                      <View
                        style={[
                          styles.splitTop,
                          { backgroundColor: primaryWork ? primaryBg : "transparent" },
                        ]}
                      />
                      <View
                        style={[
                          styles.splitBottom,
                          { backgroundColor: secondaryWork ? secondaryBg : "transparent" },
                        ]}
                      />
                    </>
                  ) : primaryWork ? (
                    <View style={[styles.solidFill, { backgroundColor: primaryBg }]} />
                  ) : null}

                  {/* Holiday shadow overlay */}
                  {holiday ? <View style={styles.holidayShadow} /> : null}

                  {/* Day number */}
                  <Text
                    style={[
                      styles.dayNum,
                      { color: primaryWork ? "#FFFFFF" : colors.onSurface },
                      holiday && !primaryWork && { color: colors.warning, fontWeight: "800" },
                    ]}
                  >
                    {d.getDate()}
                  </Text>

                  {/* Primary tag */}
                  {info && info.type !== "FOLGA" ? (
                    <Text style={[styles.shiftTag, { color: "#FFFFFF" }]}>
                      {info.type === "FERIAS" ? "FÉRIAS" : info.type}
                    </Text>
                  ) : null}

                  {/* Override dot */}
                  {info?.overridden ? <View style={styles.overrideDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legend}>
          <LegendItem color={current?.shift_day_color ?? colors.shiftDay} label="SD" />
          <LegendItem color={current?.shift_night_color ?? colors.shiftNight} label="SN" />
          <LegendItem color={current?.avulso_color ?? colors.success} label="Avulso" />
          <LegendItem color={colors.warning} label="Férias" />
          <LegendItem color={colors.shiftRest} label="Folga" />
        </View>

        {secondary ? (
          <Text style={styles.hint}>
            Toque para editar {current?.name}. Toque e segure para editar {secondary.name}.
          </Text>
        ) : null}

        {nextShift && current ? (
          <View style={styles.nextCard} testID="next-shift-card">
            <Text style={styles.nextTitle}>Próximo plantão</Text>
            <View style={styles.nextRow}>
              <View
                style={[
                  styles.nextBadge,
                  { backgroundColor: shiftColor(nextShift.type, current) },
                ]}
              >
                <Text style={styles.nextBadgeText}>{nextShift.type}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nextDate}>{formatFullDate(nextShift.date)}</Text>
                <Text style={styles.nextHours}>
                  {nextShift.start_time ?? "--:--"} — {nextShift.end_time ?? "--:--"}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {loading ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : null}

      <EditShiftSheet ref={sheetRef} onSaved={load} />

      <WorkplacePicker
        open={pickerOpen === "primary"}
        onClose={() => setPickerOpen(null)}
        workplaces={workplaces}
        currentId={current?.id ?? null}
        onSelect={(id) => {
          setCurrentId(id);
          if (secondaryId === id) setSecondaryId(null);
          setPickerOpen(null);
        }}
      />
      <WorkplacePicker
        open={pickerOpen === "secondary"}
        onClose={() => setPickerOpen(null)}
        workplaces={workplaces.filter((w) => w.id !== current?.id)}
        currentId={secondaryId}
        onSelect={(id) => {
          setSecondaryId(id);
          setPickerOpen(null);
        }}
        title="Selecionar 2º local"
      />
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function formatFullDate(iso: string): string {
  const d = parseISODate(iso);
  const dow = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][d.getDay()];
  const day = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dow}, ${day}/${mm}/${d.getFullYear()}`;
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  wpRow: { flexDirection: "row", gap: spacing.sm },
  wpSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  wpSelectorActive: { backgroundColor: colors.brandSecondary },
  wpDot: { width: 10, height: 10, borderRadius: 5 },
  wpName: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  monthBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  monthLabel: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  weekRow: { flexDirection: "row", marginTop: spacing.md },
  weekDay: {
    flex: 1,
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingTop: spacing.sm },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
  },
  cellFill: {
    flex: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: 44,
  },
  solidFill: { ...(StyleFill()) },
  splitTop: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: "50%",
  },
  splitBottom: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: "50%",
  },
  holidayShadow: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.warning,
    opacity: 0.15,
  },
  dayNum: { fontSize: 15, fontWeight: "600" },
  shiftTag: { fontSize: 9, fontWeight: "800", marginTop: 1, letterSpacing: 0.5 },
  overrideDot: {
    position: "absolute",
    top: 4, right: 4,
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: colors.warning,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
    flexWrap: "wrap",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  hint: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  nextCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.brandSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  nextTitle: {
    color: colors.onBrandSecondary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  nextRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  nextBadge: {
    width: 56, height: 56, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
  },
  nextBadgeText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  nextDate: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  nextHours: { color: colors.muted, fontSize: 14, marginTop: 2 },
  loadingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "flex-start",
    paddingTop: 200,
  },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.brandSecondary,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.lg,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  emptyBody: {
    color: colors.muted, textAlign: "center",
    marginTop: spacing.sm, fontSize: 14, lineHeight: 20,
  },
  emptyBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
  },
  emptyBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },
}));

// Helper for solid fill absolute-positioned
function StyleFill() {
  return {
    position: "absolute" as const,
    top: 0, left: 0, right: 0, bottom: 0,
  };
}
