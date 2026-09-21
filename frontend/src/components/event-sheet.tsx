import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Platform } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { api, ExtraEvent } from "@/src/api/client";
import { isoToBR, MONTHS_PT, parseISODate } from "@/src/utils/shifts";

export type EventSheetRef = { open: (date: string, event: ExtraEvent | null) => void };
type Props = { onSaved: () => void };

const COLORS = [
  "#007AFF", "#FF3B30", "#34C759", "#FF9500", "#5856D6",
  "#AF52DE", "#FF2D55", "#00A5B8", "#8E4EC6", "#32827A",
];

export const EventSheet = forwardRef<EventSheetRef, Props>(function ({ onSaved }, ref) {
  const styles = useStyles();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);

  const [editing, setEditing] = useState<ExtraEvent | null>(null);
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(COLORS[2]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapPoints = useMemo(() => ["82%"], []);

  useImperativeHandle(ref, () => ({
    open: (d, ev) => {
      setDate(d);
      setEditing(ev);
      setError(null);
      if (ev) {
        setLabel(ev.label);
        setColor(ev.color);
        setStart(ev.start_time ?? "");
        setEnd(ev.end_time ?? "");
        setNote(ev.note ?? "");
      } else {
        setLabel("");
        setColor(COLORS[2]);
        setStart("");
        setEnd("");
        setNote("");
      }
      sheetRef.current?.snapToIndex(0);
    },
  }));

  const validTime = (v: string) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

  const onSave = async () => {
    setError(null);
    if (!label.trim()) return setError("Informe o nome do plantão");
    if (!validTime(start) || !validTime(end)) return setError("Horários no formato HH:mm (deixe vazio se não aplicável)");
    setSaving(true);
    try {
      const body = {
        date,
        label: label.trim(),
        color,
        start_time: start || null,
        end_time: end || null,
        note: note.trim() || null,
      };
      if (editing) await api.updateEvent(editing.id, body);
      else await api.createEvent(body);
      sheetRef.current?.close();
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.deleteEvent(editing.id);
      sheetRef.current?.close();
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Erro ao excluir");
    } finally {
      setSaving(false);
    }
  };

  const backdrop = useCallback(
    (p: any) => (
      <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    []
  );

  const dateLabel = useMemo(() => {
    if (!date) return "";
    const d = parseISODate(date);
    return `${String(d.getDate()).padStart(2, "0")} de ${MONTHS_PT[d.getMonth()]}, ${d.getFullYear()}`;
  }, [date]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={backdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      keyboardBehavior={Platform.OS === "ios" ? "interactive" : "extend"}
      keyboardBlurBehavior="restore"
    >
      <BottomSheetScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          {editing ? "Editar plantão aleatório" : "Novo plantão aleatório"}
        </Text>
        <Text style={styles.sub}>{dateLabel}</Text>

        <Text style={styles.label}>Nome (aparece no calendário)</Text>
        <TextInput
          testID="event-label-input"
          value={label}
          onChangeText={setLabel}
          placeholder="Ex: SD HC, Trancista, Periódico"
          placeholderTextColor={colors.muted}
          style={styles.input}
          maxLength={40}
        />

        <Text style={styles.label}>Cor</Text>
        <View style={styles.swatches}>
          {COLORS.map((c) => (
            <Pressable
              key={c}
              testID={`event-color-${c}`}
              onPress={() => setColor(c)}
              style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
            />
          ))}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Início</Text>
            <TextInput
              testID="event-start-input"
              value={start}
              onChangeText={setStart}
              placeholder="HH:mm"
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Fim</Text>
            <TextInput
              testID="event-end-input"
              value={end}
              onChangeText={setEnd}
              placeholder="HH:mm"
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>

        <Text style={styles.label}>Observação</Text>
        <TextInput
          testID="event-note-input"
          value={note}
          onChangeText={setNote}
          placeholder="Ex: cobertura, extra, curso, etc."
          placeholderTextColor={colors.muted}
          style={[styles.input, { minHeight: 56 }]}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {editing ? (
          <Pressable testID="event-delete" onPress={onDelete} style={styles.deleteBtn} disabled={saving}>
            <Text style={styles.deleteText}>Excluir</Text>
          </Pressable>
        ) : null}

        <Pressable
          testID="event-save-button"
          onPress={onSave}
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.saveText}>{editing ? "Salvar alterações" : "Adicionar plantão"}</Text>
          )}
        </Pressable>
        <View style={{ height: spacing.xxl }} />
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

const useStyles = makeStyles((colors) => ({
  container: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  title: { fontSize: 20, fontWeight: "700", color: colors.onSurface },
  sub: { color: colors.muted, marginTop: 2 },
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchActive: { borderColor: colors.onSurface },
  row: { flexDirection: "row", gap: spacing.md },
  error: { color: colors.error, marginTop: spacing.md, fontSize: 14 },
  deleteBtn: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  deleteText: { color: colors.error, fontWeight: "700" },
  saveBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 4,
    alignItems: "center",
  },
  saveText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
}));
