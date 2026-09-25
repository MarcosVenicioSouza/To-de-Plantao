// Calendar palettes (soft pastel glass themes)
import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PaletteId = "white" | "blue" | "pink" | "red";

export type Palette = {
  id: PaletteId;
  label: string;
  swatch: string;       // preview color
  background: string;   // page background
  cardTint: string;     // translucent card bg
  cardHighlight: string;// highlight overlay for glass gradient top
  cardBorder: string;   // subtle border
  shadowColor: string;  // colored soft shadow
  weekendAccent: string;// weekend number color
  primaryText: string;  // day numbers
  headerText: string;   // month title
  mutedText: string;    // muted labels
  holidayBg: string;    // holiday chip bg
  holidayText: string;  // holiday chip text
};

export const PALETTES: Record<PaletteId, Palette> = {
  white: {
    id: "white",
    label: "Branco",
    swatch: "#F1F5F9",
    background: "#EEF2F7",
    cardTint: "rgba(255,255,255,0.85)",
    cardHighlight: "rgba(255,255,255,0.55)",
    cardBorder: "rgba(255,255,255,0.9)",
    shadowColor: "rgba(15,23,42,0.12)",
    weekendAccent: "#DC2626",
    primaryText: "#0F172A",
    headerText: "#0F172A",
    mutedText: "#64748B",
    holidayBg: "rgba(34,197,94,0.16)",
    holidayText: "#166534",
  },
  blue: {
    id: "blue",
    label: "Azul",
    swatch: "#DBEAFE",
    background: "#E0EAF6",
    cardTint: "rgba(255,255,255,0.72)",
    cardHighlight: "rgba(255,255,255,0.5)",
    cardBorder: "rgba(255,255,255,0.9)",
    shadowColor: "rgba(30,64,175,0.18)",
    weekendAccent: "#DC2626",
    primaryText: "#0F172A",
    headerText: "#0F172A",
    mutedText: "#475569",
    holidayBg: "rgba(34,197,94,0.16)",
    holidayText: "#166534",
  },
  pink: {
    id: "pink",
    label: "Rosa",
    swatch: "#FCE7F3",
    background: "#FBE1E9",
    cardTint: "rgba(255,255,255,0.6)",
    cardHighlight: "rgba(255,255,255,0.45)",
    cardBorder: "rgba(255,255,255,0.9)",
    shadowColor: "rgba(219,39,119,0.18)",
    weekendAccent: "#BE185D",
    primaryText: "#5A102E",
    headerText: "#5A102E",
    mutedText: "#9F5679",
    holidayBg: "rgba(34,197,94,0.2)",
    holidayText: "#166534",
  },
  red: {
    id: "red",
    label: "Lilás",
    swatch: "#EDE9FE",
    background: "#EAE0FB",
    cardTint: "rgba(255,255,255,0.7)",
    cardHighlight: "rgba(255,255,255,0.45)",
    cardBorder: "rgba(255,255,255,0.9)",
    shadowColor: "rgba(124,58,237,0.2)",
    weekendAccent: "#7C3AED",
    primaryText: "#3B0F72",
    headerText: "#3B0F72",
    mutedText: "#7C5FAB",
    holidayBg: "rgba(34,197,94,0.2)",
    holidayText: "#166534",
  },
};

const STORAGE_KEY = "escala_palette";

type Ctx = {
  paletteId: PaletteId;
  palette: Palette;
  setPaletteId: (id: PaletteId) => void;
};

const PaletteCtx = createContext<Ctx | null>(null);

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [paletteId, setPaletteIdState] = useState<PaletteId>("white");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v && v in PALETTES) setPaletteIdState(v as PaletteId);
    });
  }, []);

  const setPaletteId = (id: PaletteId) => {
    setPaletteIdState(id);
    AsyncStorage.setItem(STORAGE_KEY, id);
  };

  const value: Ctx = {
    paletteId,
    palette: PALETTES[paletteId],
    setPaletteId,
  };
  return <PaletteCtx.Provider value={value}>{children}</PaletteCtx.Provider>;
}

export function usePalette(): Ctx {
  const v = useContext(PaletteCtx);
  if (!v) throw new Error("usePalette outside provider");
  return v;
}
