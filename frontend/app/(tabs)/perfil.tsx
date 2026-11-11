import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Switch, ScrollView, Alert, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { useAuth } from "@/src/contexts/auth";
import { useWorkplaces } from "@/src/contexts/workplaces";
import { api } from "@/src/api/client";
import { computeCycleShift, fmtDate, shiftDefaultHours } from "@/src/utils/shifts";
import { useRouter } from "expo-router";
import { PALETTES, PaletteId, usePalette } from "@/src/palettes";
import {
  cancelAllReminders,
  ensureNotificationsReady,
  scheduleShiftReminder,
} from "@/src/utils/notifications";

const NOTIF_KEY = "escala_notif_enabled";

export default function PerfilScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const { current, workplaces } = useWorkplaces();
  const router = useRouter();
  const { paletteId, setPaletteId } = usePalette();
  const [notifOn, setNotifOn] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_KEY).then((v) => setNotifOn(v === "1"));
  }, []);

  const toggleNotif = async (v: boolean) => {
    if (v) {
      if (Platform.OS === "web") {
        Alert.alert("Indisponível", "Notificações locais funcionam no dispositivo (iOS/Android).");
        return;
      }
      const granted = await ensureNotificationsReady();
      if (!granted) {
        Alert.alert("Permissão negada", "Habilite notificações nas configurações do sistema.");
        return;
      }
      await AsyncStorage.setItem(NOTIF_KEY, "1");
      setNotifOn(true);
      await rescheduleAll();
    } else {
      await cancelAllReminders();
      await AsyncStorage.setItem(NOTIF_KEY, "0");
      setNotifOn(false);
    }
  };

  const rescheduleAll = async () => {
    if (Platform.OS === "web") return;
    setScheduling(true);
    try {
      await cancelAllReminders();
      const now = new Date();
      let count = 0;
      // Schedule the next 60 days across all workplaces.
      for (const wp of workplaces) {
        const months = new Set<string>();
        for (let i = 0; i < 60; i++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
          months.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
        }
        const overrideList = [] as Awaited<ReturnType<typeof api.listOverrides>>;
        for (const key of months) {
          const [y, m] = key.split("-").map(Number);
          const arr = await api.listOverrides(wp.id, y, m).catch(() => []);
          overrideList.push(...arr);
        }
        const ovMap = new Map(overrideList.map((o) => [o.date, o]));
        for (let i = 0; i < 60; i++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
          const iso = fmtDate(d);
          const o = ovMap.get(iso);
          const t = o ? o.shift_type : computeCycleShift(d, wp);
          if (t === "FOLGA" || t === "FERIAS") continue;
          const h = o
            ? { start: o.start_time, end: o.end_time }
            : shiftDefaultHours(t, wp);
          if (!h.start) continue;
          const [hh, mm] = h.start.split(":").map((v) => parseInt(v, 10));
          const trigger = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
          trigger.setHours(trigger.getHours() - 1);
          const id = await scheduleShiftReminder(
            trigger,
            `Plantão ${t} em 1h`,
            `${wp.name} • ${h.start} — ${h.end}`
          );
          if (id) count++;
        }
      }
      Alert.alert("Pronto", `${count} lembretes agendados para os próximos 60 dias.`);
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Não foi possível agendar");
    } finally {
      setScheduling(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert("Sair", "Deseja realmente sair da conta?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => logout() },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert(
      "Excluir conta",
      "Isso apaga permanentemente sua conta, seus locais de trabalho, plantões e feriados. Não é possível desfazer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteMe();
              await logout();
            } catch (e: any) {
              Alert.alert("Erro", e.message ?? "Não foi possível excluir a conta");
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.h1}>Perfil</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text testID="profile-name" style={styles.userName}>{user?.name}</Text>
            <Text testID="profile-email" style={styles.userEmail}>{user?.email}</Text>
          </View>
        </View>

        <Text style={styles.sectionHead}>Aparência</Text>
        <View style={styles.paletteRow}>
          {(Object.keys(PALETTES) as PaletteId[]).map((id) => {
            const p = PALETTES[id];
            const active = paletteId === id;
            return (
              <Pressable
                key={id}
                testID={`palette-${id}`}
                onPress={() => setPaletteId(id)}
                style={[
                  styles.paletteChip,
                  { backgroundColor: p.swatch },
                  active && { borderColor: colors.brandPrimary, borderWidth: 2 },
                ]}
              >
                <Text style={styles.paletteLabel}>{p.label}</Text>
                {active ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={colors.brandPrimary}
                    style={{ position: "absolute", top: 4, right: 4 }}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionHead}>Preferências</Text>
        <Pressable
          testID="open-holidays"
          style={styles.rowCard}
          onPress={() => router.push("/feriados")}
        >
          <Ionicons name="star-outline" size={22} color={colors.onSurface} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Feriados</Text>
            <Text style={styles.rowBody}>Nacionais e personalizados</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        <View style={[styles.rowCard, { marginTop: spacing.sm }]}>
          <Ionicons name="notifications-outline" size={22} color={colors.onSurface} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Lembretes de plantão</Text>
            <Text style={styles.rowBody}>Notificação 1h antes de cada plantão</Text>
          </View>
          <Switch
            testID="notif-switch"
            value={notifOn}
            onValueChange={toggleNotif}
            trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
          />
        </View>
        {notifOn ? (
          <Pressable
            testID="notif-refresh"
            style={styles.rowAction}
            onPress={rescheduleAll}
            disabled={scheduling}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.rowActionText}>
              {scheduling ? "Reagendando…" : "Reagendar lembretes"}
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionHead}>Conta</Text>
        <Pressable testID="logout-button" style={styles.rowCard} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={22} color={colors.error} />
          <Text style={[styles.rowTitle, { color: colors.error, flex: 1 }]}>Sair da conta</Text>
        </Pressable>
        <Pressable
          testID="delete-account-button"
          style={[styles.rowCard, { marginTop: spacing.sm }]}
          onPress={confirmDelete}
        >
          <Ionicons name="trash-outline" size={22} color={colors.error} />
          <Text style={[styles.rowTitle, { color: colors.error, flex: 1 }]}>Excluir conta</Text>
        </Pressable>

        <Text style={styles.legal}>
          Desenvolvido por: Marcos Venício S. De Cerqueira
        </Text>
      </ScrollView>
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
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onBrandPrimary, fontSize: 24, fontWeight: "700" },
  userName: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  userEmail: { color: colors.muted, marginTop: 2 },
  sectionHead: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  rowBody: { color: colors.muted, fontSize: 13, marginTop: 2 },
  rowAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowActionText: { color: colors.brandPrimary, fontWeight: "600" },
  legal: {
    marginTop: spacing.xxl,
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
  },
  paletteRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  paletteChip: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    justifyContent: "flex-end",
  },
  paletteLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onSurface,
  },
}));
