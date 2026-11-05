import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { useAuth } from "@/src/contexts/auth";

export default function AlterarSenhaScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { changePassword } = useAuth();
  const router = useRouter();

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (p1.length < 8) return setError("A nova senha precisa ter pelo menos 8 caracteres");
    if (p1 !== p2) return setError("As senhas não conferem");
    setSaving(true);
    try {
      await changePassword(p1);
      Alert.alert("Pronto", "Sua senha foi atualizada com sucesso.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      setError(e.message ?? "Erro ao atualizar a senha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.h1}>Alterar senha</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.hint}>
            Escolha uma nova senha de pelo menos 8 caracteres. Você vai usar a nova senha nos próximos logins.
          </Text>

          <Text style={styles.label}>Nova senha</Text>
          <View style={styles.pwRow}>
            <TextInput
              testID="new-password-input"
              style={[styles.input, { flex: 1 }]}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={colors.muted}
              secureTextEntry={!show}
              value={p1}
              onChangeText={setP1}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShow((v) => !v)} style={styles.pwEye} hitSlop={8}>
              <Ionicons
                name={show ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.muted}
              />
            </Pressable>
          </View>

          <Text style={[styles.label, { marginTop: spacing.md }]}>Confirmar nova senha</Text>
          <TextInput
            testID="confirm-password-input"
            style={styles.input}
            placeholder="Digite novamente"
            placeholderTextColor={colors.muted}
            secureTextEntry={!show}
            value={p2}
            onChangeText={setP2}
            autoCapitalize="none"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            testID="save-password-button"
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
            onPress={onSubmit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.btnText}>Salvar nova senha</Text>
            )}
          </Pressable>
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
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  h1: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  hint: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    fontSize: 16,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pwRow: { flexDirection: "row", alignItems: "center" },
  pwEye: {
    position: "absolute",
    right: spacing.md,
    height: 44,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { color: colors.error, marginTop: spacing.md, fontSize: 14 },
  btn: {
    marginTop: spacing.xl,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 4,
    alignItems: "center",
  },
  btnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
}));
