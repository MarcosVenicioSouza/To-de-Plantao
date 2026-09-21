import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { useWorkplaces } from "@/src/contexts/workplaces";
import { api, ShiftOverride } from "@/src/api/client";
import { MONTHS_PT, monthlyReport } from "@/src/utils/shifts";

export default function RelatoriosScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { workplaces, current, setCurrentId } = useWorkplaces();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [overrides, setOverrides] = useState<ShiftOverride[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!current) {
        setOverrides([]);
        return;
      }
      setLoading(true);
      try {
        const list = await api.listOverrides(current.id, year, month + 1);
        setOverrides(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [current?.id, year, month]);

  const report = useMemo(() => {
    if (!current) return null;
    return monthlyReport(year, month, current, overrides);
  }, [current, year, month, overrides]);

  const prev = () => (month === 0 ? (setYear(year - 1), setMonth(11)) : setMonth(month - 1));
  const next = () => (month === 11 ? (setYear(year + 1), setMonth(0)) : setMonth(month + 1));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.h1}>Relatórios</Text>
        <Text style={styles.sub}>Horas trabalhadas por mês</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
      >
        {workplaces.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>Adicione um local de trabalho para ver relatórios.</Text>
          </View>
        ) : (
          <>
            <View style={styles.wpChips}>
              {workplaces.map((w) => {
                const active = w.id === current?.id;
                return (
                  <Pressable
                    key={w.id}
                    testID={`report-wp-${w.id}`}
                    onPress={() => setCurrentId(w.id)}
                    style={[
                      styles.chip,
                      active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
                    ]}
                  >
                    <View style={[styles.chipDot, { backgroundColor: w.color }]} />
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? colors.onBrandPrimary : colors.onSurface },
                      ]}
                    >
                      {w.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.monthRow}>
              <Pressable onPress={prev} style={styles.monthBtn} hitSlop={8}>
                <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
              </Pressable>
              <Text style={styles.monthLabel}>
                {MONTHS_PT[month]} {year}
              </Text>
              <Pressable onPress={next} style={styles.monthBtn} hitSlop={8}>
                <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
              </Pressable>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
            ) : report ? (
              <>
                <View style={styles.bigCard}>
                  <Text style={styles.bigLabel}>Total de horas</Text>
                  <Text testID="report-total-hours" style={styles.bigValue}>{report.hours}h</Text>
                </View>
                <View style={styles.statsRow}>
                  <StatCard
                    label="Diurnos"
                    value={report.sd}
                    color={current?.shift_day_color ?? colors.shiftDay}
                    icon="sunny-outline"
                    testID="report-sd-count"
                  />
                  <StatCard
                    label="Noturnos"
                    value={report.sn}
                    color={current?.shift_night_color ?? colors.shiftNight}
                    icon="moon-outline"
                    testID="report-sn-count"
                  />
                  <StatCard
                    label="Avulso"
                    value={report.avulso}
                    color={current?.avulso_color ?? colors.success}
                    icon="flash-outline"
                    testID="report-avulso-count"
                  />
                </View>
                <View style={styles.statsRow}>
                  <StatCard
                    label="Folgas"
                    value={report.folga}
                    color={colors.muted}
                    icon="cafe-outline"
                    testID="report-folga-count"
                  />
                  <StatCard
                    label="Férias"
                    value={report.ferias}
                    color={colors.warning}
                    icon="airplane-outline"
                    testID="report-ferias-count"
                  />
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
  testID,
}: {
  label: string;
  value: number;
  color: string;
  icon: any;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={18} color="#FFFFFF" />
      </View>
      <Text testID={testID} style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  h1: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { color: colors.muted, marginTop: 2 },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.muted, textAlign: "center" },
  wpChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, fontWeight: "600" },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
  },
  monthBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  monthLabel: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  bigCard: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  bigLabel: {
    color: colors.onBrandPrimary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    opacity: 0.85,
  },
  bigValue: {
    color: colors.onBrandPrimary,
    fontSize: 48,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  statValue: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
}));
