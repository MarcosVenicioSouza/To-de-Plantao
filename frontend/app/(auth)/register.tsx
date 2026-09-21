import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Link, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { useAuth } from "@/src/contexts/auth";

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError("Preencha todos os campos");
      return;
    }
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
    } catch (e: any) {
      setError(e.message ?? "Erro ao cadastrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => router.back()}
            style={styles.back}
            hitSlop={12}
            testID="register-back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>

          <View style={styles.brand}>
            <Text style={styles.title}>Criar conta</Text>
            <Text style={styles.subtitle}>Comece a organizar seus plantões</Text>
          </View>

          <View>
            <Text style={styles.label}>Nome</Text>
            <TextInput
              testID="register-name-input"
              style={styles.input}
              placeholder="Seu nome"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>E-mail</Text>
            <TextInput
              testID="register-email-input"
              style={styles.input}
              placeholder="voce@exemplo.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>Senha</Text>
            <TextInput
              testID="register-password-input"
              style={styles.input}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={colors.muted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {error ? (
              <Text testID="register-error" style={styles.error}>
                {error}
              </Text>
            ) : null}

            <Pressable
              testID="register-submit-button"
              style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.btnText}>Criar conta</Text>
              )}
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Já tem conta? </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable testID="go-login-link">
                  <Text style={styles.footerLink}>Entrar</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl },
  back: { width: 40, height: 40, justifyContent: "center", marginLeft: -spacing.sm },
  brand: { marginTop: spacing.xl, marginBottom: spacing.xl },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: spacing.xs },
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
  error: { color: colors.error, marginTop: spacing.md, fontSize: 14 },
  btn: {
    marginTop: spacing.xl,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 4,
    alignItems: "center",
  },
  btnPressed: { opacity: 0.85 },
  btnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  footerText: { color: colors.muted },
  footerLink: { color: colors.brandPrimary, fontWeight: "600" },
}));
