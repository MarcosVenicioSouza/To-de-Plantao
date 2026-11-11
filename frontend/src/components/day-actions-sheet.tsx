import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { api, ExtraEvent, Workplace } from "@/src/api/client";
import { isoToBR, MONTHS_PT, parseISODate } from "@/src/utils/shifts";

type OpenArgs = {
  date: string;
  workplaces: Workplace[];
  events: ExtraEvent[];
  onEditShift: (wp: Workplace) => void;
  onAddEvent: () => void;
  onEditEvent: (ev: ExtraEvent) => void;
};

export type DayActionsSheetRef = { open: (args: OpenArgs) => void; close: () => void };

export const DayActionsSheet = forwardRef<DayActionsSheetRef>(function (_, ref) {
  const styles = useStyles();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  const [args, setArgs] = useState<OpenArgs | null>(null);
  const [busy, setBusy] = useState(false);

  const snapPoints = useMemo(() => ["55%", "80%"], []);

  useImperativeHandle(ref, () => ({
    open: (a) => {
      setArgs(a);
      sheetRef.current?.snapToIndex(0);
    },
    close: () => sheetRef.current?.close(),
  }));

  const backdrop = useCallback(
    (p: any) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    []
  );

  const deleteEvent = async (ev: ExtraEvent) => {
    setBusy(true);
    try {
      await api.deleteEvent(ev.id);
      Alert.alert("Removido", "Plantão aleatório removido");
      sheetRef.current?.close();
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Não foi possível remover");
    } finally {
      setBusy(false);
    }
  };

  const label = args ? formatDate(args.date) : "";

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={backdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
    >
      <BottomSheetView style={styles.container}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.sub}>O que deseja fazer?</Text>

        <ScrollView style={{ marginTop: spacing.md }}>
          <Text style={styles.sectionHead}>Plantões dos meus locais</Text>
          {(args?.workplaces ?? []).map((wp) => (
            <Pressable
              key={wp.id}
              testID={`day-action-wp-${wp.id}`}
              style={styles.rowBtn}
              onPress={() => {
                sheetRef.current?.close();
                args?.onEditShift(wp);
              }}
            >
              <View style={[styles.wpDot, { backgroundColor: wp.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Editar em {wp.name}</Text>
                <Text style={styles.rowBody}>Trocar SD/SN, marcar folga, férias ou avulso</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}

          <Text style={styles.sectionHead}>Plantões aleatórios neste dia</Text>
          {(args?.events ?? []).length === 0 ? (
            <Text style={styles.emptyHint}>Nenhum plantão aleatório neste dia.</Text>
          ) : (
            (args?.events ?? []).map((ev) => (
              <View key={ev.id} style={styles.rowBtn}>
                <View style={[styles.wpDot, { backgroundColor: ev.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{ev.label}</Text>
                  <Text style={styles.rowBody}>
                    {ev.start_time && ev.end_time ? `${ev.start_time} — ${ev.end_time}` : "Sem horário"}
                    {ev.note ? ` • ${ev.note}` : ""}
                  </Text>
                </View>
                <Pressable
                  testID={`edit-event-${ev.id}`}
                  hitSlop={8}
                  onPress={() => {
                    sheetRef.current?.close();
                    args?.onEditEvent(ev);
                  }}
                >
                  <Ionicons name="create-outline" size={20} color={colors.onSurface} />
                </Pressable>
                <Pressable
                  testID={`del-event-${ev.id}`}
                  hitSlop={8}
                  onPress={() => deleteEvent(ev)}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  )}
                </Pressable>
              </View>
            ))
          )}

          <Pressable
            testID="day-action-add-event"
            style={styles.addBtn}
            onPress={() => {
              sheetRef.current?.close();
              args?.onAddEvent();
            }}
          >
            <Ionicons name="flash" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.addText}>Adicionar plantão aleatório</Text>
          </Pressable>
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
});

function formatDate(iso: string): string {
  const d = parseISODate(iso);
  const dow = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][d.getDay()];
  return `${dow}, ${String(d.getDate()).padStart(2, "0")} de ${MONTHS_PT[d.getMonth()]}`;
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  sub: { color: colors.muted, marginTop: 2 },
  sectionHead: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  wpDot: { width: 12, height: 12, borderRadius: 6 },
  rowTitle: { color: colors.onSurface, fontWeight: "600", fontSize: 14 },
  rowBody: { color: colors.muted, fontSize: 12, marginTop: 2 },
  emptyHint: { color: colors.muted, marginBottom: spacing.sm, fontSize: 13 },
  addBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  addText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },
}));
