import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Platform, Switch } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { api, CyclePattern, VacationPeriod, Workplace } from "@/src/api/client";
import { brToISO, CYCLE_LABELS, CYCLE_ORDER, fmtDate, isoToBR } from "@/src/utils/shifts";

export type WorkplaceFormSheetRef = { open: (wp: Workplace | null) => void };
type Props = { onSaved: () => void };

const COLOR_SWATCHES = [
  "#32827A", "#007AFF", "#FF3B30", "#FF9500", "#5856D6",
  "#AF52DE", "#FF2D55", "#34C759", "#00A5B8", "#8E4EC6",
];

export const WorkplaceFormSheet = forwardRef<WorkplaceFormSheetRef, Props>(function (
  { onSaved },
  ref
) {
  const styles = useStyles();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);

  const [editing, setEditing] = useState<Workplace | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [cyclePattern, setCyclePattern] = useState<CyclePattern>("SD_F_SN_F_F");
  const [cycleStart, setCycleStart] = useState(isoToBR(fmtDate(new Date())));
  const [cycleShift, setCycleShift] = useState<"SD" | "SN">("SD");
  const [cycleRepeatMonths, setCycleRepeatMonths] = useState<number | null>(null);
  const [sdStart, setSdStart] = useState("07:00");
  const [sdEnd, setSdEnd] = useState("19:00");
  const [snStart, setSnStart] = useState("19:00");
  const [snEnd, setSnEnd] = useState("07:00");
  const [shiftDayColor, setShiftDayColor] = useState("#007AFF");
  const [shiftNightColor, setShiftNightColor] = useState("#FF3B30");
  const [avulsoColor, setAvulsoColor] = useState("#34C759");
  const [isAvulsoOnly, setIsAvulsoOnly] = useState(false);
  const [vacations, setVacations] = useState<VacationPeriod[]>([]);
  const [vacStart, setVacStart] = useState("");
  const [vacEnd, setVacEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapPoints = useMemo(() => ["94%"], []);

  useImperativeHandle(ref, () => ({
    open: (wp) => {
      setEditing(wp);
      setError(null);
      if (wp) {
        setName(wp.name);
        setColor(wp.color);
        setCyclePattern(wp.cycle_pattern);
        setCycleStart(isoToBR(wp.cycle_start_date));
        setCycleShift(wp.cycle_start_shift);
        setCycleRepeatMonths(wp.cycle_repeat_months ?? null);
        setSdStart(wp.sd_start);
        setSdEnd(wp.sd_end);
        setSnStart(wp.sn_start);
        setSnEnd(wp.sn_end);
        setShiftDayColor(wp.shift_day_color);
        setShiftNightColor(wp.shift_night_color);
        setAvulsoColor(wp.avulso_color);
        setIsAvulsoOnly(wp.is_avulso_only);
        setVacations(wp.vacations ?? []);
      } else {
        setName("");
        setColor(COLOR_SWATCHES[0]);
        setCyclePattern("SD_F_SN_F_F");
        setCycleStart(isoToBR(fmtDate(new Date())));
        setCycleShift("SD");
        setCycleRepeatMonths(null);
        setSdStart("07:00");
        setSdEnd("19:00");
        setSnStart("19:00");
        setSnEnd("07:00");
        setShiftDayColor("#007AFF");
        setShiftNightColor("#FF3B30");
        setAvulsoColor("#34C759");
        setIsAvulsoOnly(false);
        setVacations([]);
      }
      setVacStart("");
      setVacEnd("");
      sheetRef.current?.snapToIndex(0);
    },
  }));

  const validTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

  const addVacation = () => {
    const s = brToISO(vacStart);
    const e = brToISO(vacEnd);
    if (!s || !e) {
      setError("Datas de férias devem estar em DD/MM/AAAA");
      return;
    }
    if (s > e) {
      setError("A data inicial das férias deve ser antes da final");
      return;
    }
    setError(null);
    setVacations((prev) => [...prev, { start: s, end: e }]);
    setVacStart("");
    setVacEnd("");
  };

  const removeVacation = (i: number) =>
    setVacations((prev) => prev.filter((_, idx) => idx !== i));

  const onSave = async () => {
    setError(null);
    if (!name.trim()) return setError("Informe o nome do local");
    const cycleISO = brToISO(cycleStart);
    if (!isAvulsoOnly && !cycleISO) return setError("Data do ciclo em DD/MM/AAAA");
    if (!isAvulsoOnly) {
      if (!validTime(sdStart) || !validTime(sdEnd) || !validTime(snStart) || !validTime(snEnd)) {
        return setError("Horários no formato HH:mm");
      }
    }
    setSaving(true);
    try {
      const body: any = {
        name: name.trim(),
        color,
        cycle_pattern: cyclePattern,
        cycle_start_date: cycleISO || fmtDate(new Date()),
        cycle_start_shift: cycleShift,
        cycle_repeat_months: cycleRepeatMonths,
        sd_start: sdStart,
        sd_end: sdEnd,
        sn_start: snStart,
        sn_end: snEnd,
        shift_day_color: shiftDayColor,
        shift_night_color: shiftNightColor,
        avulso_color: avulsoColor,
        is_avulso_only: isAvulsoOnly,
        vacations,
      };
      if (editing) await api.updateWorkplace(editing.id, body);
      else await api.createWorkplace(body);
      sheetRef.current?.close();
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Erro ao salvar");
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
        <Text style={styles.title}>{editing ? "Editar local" : "Novo local de trabalho"}</Text>

        <Text style={styles.label}>Nome</Text>
        <TextInput
          testID="wp-name-input"
          value={name}
          onChangeText={setName}
          placeholder="Ex: Hospital São Lucas"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Cor de identificação</Text>
        <View style={styles.swatches}>
          {COLOR_SWATCHES.map((c) => (
            <Pressable
              key={c}
              testID={`wp-color-${c}`}
              onPress={() => setColor(c)}
              style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
            />
          ))}
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Somente plantão avulso</Text>
            <Text style={styles.toggleBody}>Local sem escala fixa — você marca dia a dia</Text>
          </View>
          <Switch
            testID="wp-avulso-only"
            value={isAvulsoOnly}
            onValueChange={setIsAvulsoOnly}
            trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
          />
        </View>

        {!isAvulsoOnly ? (
          <>
            <Text style={styles.sectionHead}>Sequência do ciclo</Text>
            {CYCLE_ORDER.map((p) => (
              <Pressable
                key={p}
                testID={`wp-pattern-${p}`}
                onPress={() => setCyclePattern(p)}
                style={[
                  styles.patternRow,
                  cyclePattern === p && { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary },
                ]}
              >
                <View
                  style={[
                    styles.radioOuter,
                    cyclePattern === p && { borderColor: colors.brandPrimary },
                  ]}
                >
                  {cyclePattern === p ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={styles.patternText}>{CYCLE_LABELS[p]}</Text>
              </Pressable>
            ))}

            <Text style={styles.label}>Repetir o ciclo por</Text>
            <View style={styles.seg}>
              {([
                { v: 1, label: "1 mês" },
                { v: 2, label: "2 meses" },
                { v: 6, label: "6 meses" },
                { v: null, label: "Sempre" },
              ] as const).map((opt) => {
                const active = cycleRepeatMonths === opt.v;
                return (
                  <Pressable
                    key={String(opt.v)}
                    testID={`wp-repeat-${opt.v ?? "always"}`}
                    onPress={() => setCycleRepeatMonths(opt.v)}
                    style={[
                      styles.segBtn,
                      active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segText,
                        { color: active ? colors.onBrandPrimary : colors.onSurface },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Data de início do ciclo (DD/MM/AAAA)</Text>
            <TextInput
              testID="wp-cycle-start"
              value={cycleStart}
              onChangeText={setCycleStart}
              placeholder="01/01/2026"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              maxLength={10}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={styles.label}>Primeiro plantão do ciclo</Text>
            <View style={styles.seg}>
              {(["SD", "SN"] as const).map((t) => (
                <Pressable
                  key={t}
                  testID={`wp-cycle-shift-${t}`}
                  onPress={() => setCycleShift(t)}
                  style={[
                    styles.segBtn,
                    cycleShift === t && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
                  ]}
                >
                  <Text
                    style={[
                      styles.segText,
                      { color: cycleShift === t ? colors.onBrandPrimary : colors.onSurface },
                    ]}
                  >
                    {t === "SD" ? "SD Diurno" : "SN Noturno"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionHead}>Horários</Text>
            <View style={styles.row}>
              <Field label="SD Início" flex>
                <TextInput testID="wp-sd-start" value={sdStart} onChangeText={setSdStart} style={styles.input} maxLength={5} />
              </Field>
              <Field label="SD Fim" flex>
                <TextInput testID="wp-sd-end" value={sdEnd} onChangeText={setSdEnd} style={styles.input} maxLength={5} />
              </Field>
            </View>
            <View style={styles.row}>
              <Field label="SN Início" flex>
                <TextInput testID="wp-sn-start" value={snStart} onChangeText={setSnStart} style={styles.input} maxLength={5} />
              </Field>
              <Field label="SN Fim" flex>
                <TextInput testID="wp-sn-end" value={snEnd} onChangeText={setSnEnd} style={styles.input} maxLength={5} />
              </Field>
            </View>
          </>
        ) : null}

        <Text style={styles.sectionHead}>Cores</Text>
        <Text style={styles.label}>Cor SD (Diurno)</Text>
        <View style={styles.swatches}>
          {COLOR_SWATCHES.map((c) => (
            <Pressable
              key={"sd" + c}
              testID={`wp-sd-color-${c}`}
              onPress={() => setShiftDayColor(c)}
              style={[styles.swatch, { backgroundColor: c }, shiftDayColor === c && styles.swatchActive]}
            />
          ))}
        </View>
        <Text style={styles.label}>Cor SN (Noturno)</Text>
        <View style={styles.swatches}>
          {COLOR_SWATCHES.map((c) => (
            <Pressable
              key={"sn" + c}
              testID={`wp-sn-color-${c}`}
              onPress={() => setShiftNightColor(c)}
              style={[styles.swatch, { backgroundColor: c }, shiftNightColor === c && styles.swatchActive]}
            />
          ))}
        </View>
        <Text style={styles.label}>Cor plantão avulso</Text>
        <View style={styles.swatches}>
          {COLOR_SWATCHES.map((c) => (
            <Pressable
              key={"av" + c}
              testID={`wp-avulso-color-${c}`}
              onPress={() => setAvulsoColor(c)}
              style={[styles.swatch, { backgroundColor: c }, avulsoColor === c && styles.swatchActive]}
            />
          ))}
        </View>

        <Text style={styles.sectionHead}>Férias</Text>
        {vacations.length === 0 ? (
          <Text style={styles.emptyHint}>Nenhum período de férias cadastrado.</Text>
        ) : (
          vacations.map((v, i) => (
            <View key={`${v.start}-${v.end}-${i}`} style={styles.vacRow}>
              <Ionicons name="airplane-outline" size={18} color={colors.warning} />
              <Text style={styles.vacText}>
                {isoToBR(v.start)} — {isoToBR(v.end)}
              </Text>
              <Pressable
                testID={`vac-remove-${i}`}
                onPress={() => removeVacation(i)}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
          ))
        )}
        <View style={styles.row}>
          <Field label="Início férias" flex>
            <TextInput
              testID="vac-start"
              value={vacStart}
              onChangeText={setVacStart}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={colors.muted}
              style={styles.input}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          </Field>
          <Field label="Fim férias" flex>
            <TextInput
              testID="vac-end"
              value={vacEnd}
              onChangeText={setVacEnd}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={colors.muted}
              style={styles.input}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          </Field>
        </View>
        <Pressable testID="vac-add" onPress={addVacation} style={styles.addVacBtn}>
          <Ionicons name="add" size={18} color={colors.brandPrimary} />
          <Text style={styles.addVacText}>Adicionar período de férias</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          testID="wp-save-button"
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
          onPress={onSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.saveText}>{editing ? "Salvar alterações" : "Criar local"}</Text>
          )}
        </Pressable>
        <View style={{ height: spacing.xxl }} />
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

function Field({
  label,
  children,
  flex,
}: {
  label: string;
  children: React.ReactNode;
  flex?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={{ flex: flex ? 1 : undefined, marginTop: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  title: { fontSize: 20, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.md },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.onSurfaceSecondary,
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
  toggleRow: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  toggleTitle: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  toggleBody: { color: colors.muted, fontSize: 12, marginTop: 2 },
  seg: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  segBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  segText: { fontWeight: "700", fontSize: 13 },
  sectionHead: {
    marginTop: spacing.xl,
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: { flexDirection: "row", gap: spacing.md },
  patternRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brandPrimary,
  },
  patternText: { flex: 1, color: colors.onSurface, fontSize: 13, fontWeight: "500" },
  emptyHint: { color: colors.muted, marginTop: spacing.sm, fontSize: 13 },
  vacRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  vacText: { flex: 1, color: colors.onSurface, fontSize: 13, fontWeight: "500" },
  addVacBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  addVacText: { color: colors.brandPrimary, fontWeight: "600" },
  error: { color: colors.error, marginTop: spacing.md, fontSize: 14 },
  saveBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 4,
    alignItems: "center",
  },
  saveText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
}));
