import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { api, Holiday } from "@/src/api/client";
import { brazilianHolidays, brToISO, isoToBR } from "@/src/utils/shifts";

export default function HolidaysScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<Holiday[]>([]);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await api.listHolidays());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const nationalThisYear = useMemo(() => brazilianHolidays(new Date().getFullYear()), []);

  const add = async () => {
    const iso = brToISO(date);
    if (!iso) return setError("Data deve estar em DD/MM/AAAA");
    if (!name.trim()) return setError("Informe o nome do feriado");
    setError(null);
    setLoading(true);
    try {
      await api.createHoliday(iso, name.trim());
      setName("");
      setDate("");
      await load();
    } catch (e: any) {
      setError(e.message ?? "Erro ao adicionar");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    await api.deleteHoliday(id);
    await load();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12} testID="holidays-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.h1}>Feriados</Text>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.section}>Feriados personalizados</Text>
          {loading && items.length === 0 ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.lg }} />
          ) : items.length === 0 ? (
            <Text style={styles.emptyHint}>Você ainda não adicionou nenhum feriado.</Text>
          ) : (
            items.map((h) => (
              <View key={h.id} style={styles.row}>
                <View style={styles.dot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{h.name}</Text>
                  <Text style={styles.rowSub}>{isoToBR(h.date)}</Text>
                </View>
                <Pressable
                  testID={`holiday-remove-${h.id}`}
                  onPress={() => remove(h.id)}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </Pressable>
              </View>
            ))
          )}

          <View style={styles.addCard}>
            <Text style={styles.addTitle}>Adicionar feriado</Text>
            <Text style={styles.label}>Nome</Text>
            <TextInput
              testID="holiday-name"
              value={name}
              onChangeText={setName}
              style={styles.input}
              placeholder="Ex: Aniversário da cidade"
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.label}>Data (DD/MM/AAAA)</Text>
            <TextInput
              testID="holiday-date"
              value={date}
              onChangeText={setDate}
              style={styles.input}
              placeholder="15/07/2026"
              placeholderTextColor={colors.muted}
              maxLength={10}
              keyboardType="numbers-and-punctuation"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              testID="holiday-add-button"
              onPress={add}
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.addBtnText}>Adicionar</Text>
              )}
            </Pressable>
          </View>

          <Text style={[styles.section, { marginTop: spacing.xl }]}>Feriados nacionais</Text>
          <Text style={styles.emptyHint}>Já incluídos no calendário automaticamente</Text>
          {nationalThisYear.map((h) => (
            <View key={h.date + h.name} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: colors.warning }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{h.name}</Text>
                <Text style={styles.rowSub}>{isoToBR(h.date)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  section: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  emptyHint: { color: colors.muted, marginBottom: spacing.md, fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary },
  rowTitle: { color: colors.onSurface, fontWeight: "600", fontSize: 14 },
  rowSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  addCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  addTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700", marginBottom: spacing.sm },
  label: {
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    fontWeight: "600",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: { color: colors.error, marginTop: spacing.sm, fontSize: 13 },
  addBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  addBtnText: { color: colors.onBrandPrimary, fontWeight: "700" },
}));
