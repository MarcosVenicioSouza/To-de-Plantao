// Authenticated calls to our own backend (push reminders + legacy import).
import { supabase } from "@/src/lib/supabase";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export async function backendFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Não autenticado");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      msg = (await res.json()).detail ?? msg;
    } catch {}
    throw new Error(typeof msg === "string" ? msg : `Erro ${res.status}`);
  }
  return res.json();
}
