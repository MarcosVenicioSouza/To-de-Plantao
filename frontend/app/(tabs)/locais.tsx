import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { useWorkplaces } from "@/src/contexts/workplaces";
import { api, Workplace } from "@/src/api/client";
import { WorkplaceFormSheet, WorkplaceFormSheetRef } from "@/src/components/workplace-form-sheet";
import { useRef } from "react";
import { CYCLE_LABELS, isoToBR } from "@/src/utils/shifts";

function cycleLabel(p: Workplace["cycle_pattern"]) {
  return CYCLE_LABELS[p] ?? "—";
}

export default function LocaisScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { workplaces, refresh, currentId, setCurrentId } = useWorkplaces();
  const formRef = useRef<WorkplaceFormSheetRef>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const onAdd = () => formRef.current?.open(null);
  const onEdit = (wp: Workplace) => formRef.current?.open(wp);

  const onDelete = async (wp: Workplace) => {
    if (deleting) return;
    setDeleting(wp.id);
    try {
      await api.deleteWorkplace(wp.id);
      if (currentId === wp.id) setCurrentId(null);
      await refresh();
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Não foi possível excluir");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.h1}>Locais de trabalho</Text>
        <Text style={styles.sub}>Gerencie seus plantões em vários locais</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + 120,
        }}
      >
        {workplaces.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="business-outline" size={40} color={colors.brandPrimary} />
            </View>
            <Text style={styles.emptyTitle}>Adicione seu primeiro local</Text>
            <Text style={styles.emptyBody}>
              Configure o horário do primeiro plantão SD e a data de início do ciclo.
            </Text>
          </View>
        ) : (
          workplaces.map((w) => (
            <View key={w.id} style={styles.card} testID={`wp-card-${w.id}`}>
              <View style={styles.cardHead}>
                <View style={[styles.colorSwatch, { backgroundColor: w.color }]} />
                <Text style={styles.name}>{w.name}</Text>
                <Pressable
                  onPress={() => onEdit(w)}
                  style={styles.iconBtn}
                  hitSlop={6}
                  testID={`wp-edit-${w.id}`}
                >
                  <Ionicons name="create-outline" size={20} color={colors.onSurface} />
                </Pressable>
                <Pressable
                  onPress={() => onDelete(w)}
                  style={styles.iconBtn}
                  hitSlop={6}
                  testID={`wp-delete-${w.id}`}
                >
                  {deleting === w.id ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  )}
                </Pressable>
              </View>
              <View style={styles.cardBody}>
                {w.is_avulso_only ? (
                  <InfoRow label="Modo" value="Somente plantão avulso" tint={w.avulso_color} />
                ) : (
                  <>
                    <InfoRow label="Sequência" value={cycleLabel(w.cycle_pattern)} />
                    <InfoRow label="Início do ciclo" value={isoToBR(w.cycle_start_date)} />
                    <InfoRow label="Primeiro plantão" value={w.cycle_start_shift} />
                    <InfoRow label="SD" value={`${w.sd_start} — ${w.sd_end}`} tint={w.shift_day_color} />
                    <InfoRow label="SN" value={`${w.sn_start} — ${w.sn_end}`} tint={w.shift_night_color} />
                  </>
                )}
                {w.vacations && w.vacations.length > 0 ? (
                  <InfoRow
                    label="Férias"
                    value={w.vacations.map((v) => `${isoToBR(v.start)}—${isoToBR(v.end)}`).join(", ")}
                  />
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Pressable
        testID="add-workplace-fab"
        onPress={onAdd}
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
      >
        <Ionicons name="add" size={26} color={colors.onBrandPrimary} />
        <Text style={styles.fabText}>Adicionar local</Text>
      </Pressable>

      <WorkplaceFormSheet ref={formRef} onSaved={refresh} />
    </View>
  );
}

function InfoRow({ label, value, tint }: { label: string; value: string; tint?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.infoRow}>
      {tint ? <View style={[styles.tintPill, { backgroundColor: tint }]} /> : null}
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  emptyBody: { color: colors.muted, textAlign: "center", lineHeight: 20 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  colorSwatch: { width: 14, height: 14, borderRadius: 7 },
  name: { flex: 1, fontSize: 17, fontWeight: "700", color: colors.onSurface },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  cardBody: { marginTop: spacing.md, gap: spacing.xs },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tintPill: { width: 6, height: 16, borderRadius: 3 },
  infoLabel: { color: colors.muted, fontSize: 13, minWidth: 130 },
  infoValue: { color: colors.onSurface, fontSize: 13, fontWeight: "600" },
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
}));
