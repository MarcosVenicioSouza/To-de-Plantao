import React from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, spacing, radius, useTheme } from "@/src/theme";
import { Workplace } from "@/src/api/client";

type Props = {
  open: boolean;
  onClose: () => void;
  workplaces: Workplace[];
  currentId: string | null;
  onSelect: (id: string) => void;
  title?: string;
};

export function WorkplacePicker({ open, onClose, workplaces, currentId, onSelect, title }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title ?? "Selecionar local"}</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {workplaces.map((w) => {
              const active = w.id === currentId;
              return (
                <Pressable
                  key={w.id}
                  testID={`pick-wp-${w.id}`}
                  style={[styles.row, active && { backgroundColor: colors.brandSecondary }]}
                  onPress={() => onSelect(w.id)}
                >
                  <View style={[styles.dot, { backgroundColor: w.color }]} />
                  <Text style={styles.name}>{w.name}</Text>
                  {active ? (
                    <Ionicons name="checkmark" size={20} color={colors.brandPrimary} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: "500" },
}));
