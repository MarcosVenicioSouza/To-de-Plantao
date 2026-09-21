import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Platform } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { ShiftInfo, MONTHS_PT, parseISODate, shiftDefaultHours } from "@/src/utils/shifts";
import { api, ShiftType, Workplace } from "@/src/api/client";

export type EditShiftSheetRef = {
  open: (date: string, info: ShiftInfo, wp: Workplace) => void;
  close: () => void;
};

type Props = { onSaved: () => void };

export const EditShiftSheet = forwardRef<EditShiftSheetRef, Props>(function EditShiftSheet(
  { onSaved },
  ref
) {
  const styles = useStyles();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);

  const [wp, setWp] = useState<Workplace | null>(null);
  const [date, setDate] = useState<string>("");
  const [info, setInfo] = useState<ShiftInfo | null>(null);
  const [type, setType] = useState<ShiftType>("SD");
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("19:00");
  const [note, setNote] = useState("");
  const [swap, setSwap] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapPoints = useMemo(() => ["78%"], []);

  useImperativeHandle(ref, () => ({
    open: (d, i, w) => {
      setDate(d);
      setInfo(i);
      setWp(w);
      setType(i.type);
      setStart(i.start_time ?? shiftDefaultHours(i.type, w).start ?? "07:00");
      setEnd(i.end_time ?? shiftDefaultHours(i.type, w).end ?? "19:00");
      setNote(i.note ?? "");
      setSwap(i.swap_with ?? "");
      setError(null);
      sheetRef.current?.snapToIndex(0);
    },
    close: () => sheetRef.current?.close(),
  }));

  const onTypeChange = (t: ShiftType) => {
    setType(t);
    if (!wp) return;
    if (t === "FOLGA" || t === "FERIAS") {
      setStart("");
      setEnd("");
      return;
    }
    if (t === "AVULSO") {
      if (!start) setStart(wp.sd_start);
      if (!end) setEnd(wp.sd_end);
      return;
    }
    const h = shiftDefaultHours(t, wp);
    setStart(h.start ?? "");
    setEnd(h.end ?? "");
  };

  const validateTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

  const onSave = async () => {
    if (!wp || !date) return;
    setError(null);
    if (type !== "FOLGA" && type !== "FERIAS") {
      if (!validateTime(start) || !validateTime(end)) {
        setError("Horários devem estar no formato HH:mm (ex: 07:00)");
        return;
      }
    }
    setSaving(true);
    try {
      await api.saveOverride(wp.id, date, {
        shift_type: type,
        start_time: type === "FOLGA" || type === "FERIAS" ? null : start,
        end_time: type === "FOLGA" || type === "FERIAS" ? null : end,
        note: note.trim() || null,
        swap_with: swap.trim() || null,
      });
      sheetRef.current?.close();
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    if (!wp || !date) return;
    setSaving(true);
    try {
      await api.deleteOverride(wp.id, date);
      sheetRef.current?.close();
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Erro ao restaurar");
    } finally {
      setSaving(false);
    }
  };

  const renderBackdrop = useCallback(
    (p: any) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    []
  );

  const dateLabel = useMemo(() => {
    if (!date) return "";
    const d = parseISODate(date);
    return `${d.getDate()} de ${MONTHS_PT[d.getMonth()]}, ${d.getFullYear()}`;
  }, [date]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      keyboardBehavior={Platform.OS === "ios" ? "interactive" : "extend"}
      keyboardBlurBehavior="restore"
    >
      <BottomSheetView style={styles.container}>
        <Text style={styles.sheetTitle}>Editar plantão</Text>
        <Text style={styles.sheetDate}>{dateLabel}</Text>

        <View style={styles.segment}>
          {(["SD", "SN", "MANHA", "TARDE", "AVULSO", "FOLGA", "FERIAS"] as ShiftType[]).map((t) => {
            const active = type === t;
            const bg =
              t === "SD"
                ? wp?.shift_day_color ?? colors.shiftDay
                : t === "SN"
                ? wp?.shift_night_color ?? colors.shiftNight
                : t === "MANHA"
                ? wp?.manha_color ?? "#FFCC00"
                : t === "TARDE"
                ? wp?.tarde_color ?? "#FF9500"
                : t === "AVULSO"
                ? wp?.avulso_color ?? colors.success
                : t === "FERIAS"
                ? colors.warning
                : colors.surfaceTertiary;
            const activeStyle = active
              ? { backgroundColor: bg, borderColor: bg }
              : { backgroundColor: colors.surface, borderColor: colors.border };
            const label =
              t === "SD"
                ? "SD"
                : t === "SN"
                ? "SN"
                : t === "MANHA"
                ? "Manhã"
                : t === "TARDE"
                ? "Tarde"
                : t === "AVULSO"
                ? "Avulso"
                : t === "FERIAS"
                ? "Férias"
                : "Folga";
            return (
              <Pressable
                key={t}
                testID={`edit-type-${t}`}
                onPress={() => onTypeChange(t)}
                style={[styles.segBtn, activeStyle]}
              >
                <Text
                  style={[
                    styles.segText,
                    {
                      color:
                        active && t !== "FOLGA"
                          ? "#FFFFFF"
                          : active
                          ? colors.onSurface
                          : colors.muted,
                    },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {type !== "FOLGA" && type !== "FERIAS" ? (
          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Início</Text>
              <TextInput
                testID="edit-start-input"
                value={start}
                onChangeText={setStart}
                placeholder="HH:mm"
                placeholderTextColor={colors.muted}
                style={styles.input}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Fim</Text>
              <TextInput
                testID="edit-end-input"
                value={end}
                onChangeText={setEnd}
                placeholder="HH:mm"
                placeholderTextColor={colors.muted}
                style={styles.input}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
          </View>
        ) : null}

        <Text style={styles.label}>Colega de troca (opcional)</Text>
        <TextInput
          testID="edit-swap-input"
          value={swap}
          onChangeText={setSwap}
          placeholder="Nome do colega"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Observação (opcional)</Text>
        <TextInput
          testID="edit-note-input"
          value={note}
          onChangeText={setNote}
          placeholder="Ex: cobertura do plantão de sábado"
          placeholderTextColor={colors.muted}
          style={[styles.input, { minHeight: 60 }]}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          {info?.overridden ? (
            <Pressable testID="edit-reset-button" style={styles.resetBtn} onPress={onReset} disabled={saving}>
              <Ionicons name="refresh-outline" size={18} color={colors.brandPrimary} />
              <Text style={styles.resetText}>Restaurar padrão</Text>
            </Pressable>
          ) : null}
          <Pressable
            testID="edit-save-button"
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.saveText}>Salvar alteração</Text>
            )}
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
});

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface },
  sheetDate: { color: colors.muted, marginTop: 2, marginBottom: spacing.lg, fontSize: 14 },
  segment: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  segBtn: {
    minWidth: 74,
    flexGrow: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  segText: { fontWeight: "700", fontSize: 13 },
  timeRow: { flexDirection: "row", gap: spacing.md },
  label: {
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    fontWeight: "600",
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: { color: colors.error, marginTop: spacing.md, fontSize: 14 },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  resetBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  resetText: { color: colors.brandPrimary, fontWeight: "600" },
  saveBtn: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 4,
    alignItems: "center",
  },
  saveText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
}));
