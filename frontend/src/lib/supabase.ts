// Supabase client for Tô de Plantão.
// Native (iOS/Android) uses AsyncStorage; web uses localStorage.
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Supabase env vars ausentes. Confira EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY."
  );
}

const webStorage = {
  getItem: (k: string) => {
    try {
      return Promise.resolve(globalThis.localStorage?.getItem(k) ?? null);
    } catch {
      return Promise.resolve(null);
    }
  },
  setItem: (k: string, v: string) => {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {}
    return Promise.resolve();
  },
  removeItem: (k: string) => {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {}
    return Promise.resolve();
  },
};

export const supabase = createClient(url, key, {
  auth: {
    storage: Platform.OS === "web" ? (webStorage as any) : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
