// Design tokens for EscalaFácil.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#111111",
  surfaceSecondary: "#F2F2F7",
  onSurfaceSecondary: "#1C1C1E",
  surfaceTertiary: "#E5E5EA",
  onSurfaceTertiary: "#3A3A3C",
  surfaceInverse: "#111111",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8E8E93",

  brand: "#32827A",
  onBrand: "#FFFFFF",
  brandPrimary: "#32827A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#EAF2F1",
  onBrandSecondary: "#1F524C",
  brandTertiary: "#D6E5E3",
  onBrandTertiary: "#296B64",

  success: "#34C759",
  onSuccess: "#FFFFFF",
  warning: "#FF9500",
  onWarning: "#FFFFFF",
  error: "#FF3B30",
  onError: "#FFFFFF",
  info: "#007AFF",
  onInfo: "#FFFFFF",

  border: "#E5E5EA",
  borderStrong: "#C7C7CC",
  divider: "#C6C6C8",

  // Shift semantic colors (defaults; overridable per-workplace)
  shiftDay: "#007AFF",
  onShiftDay: "#FFFFFF",
  shiftNight: "#FF3B30",
  onShiftNight: "#FFFFFF",
  shiftRest: "#E5E5EA",
  onShiftRest: "#3A3A3C",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const colors = light;
