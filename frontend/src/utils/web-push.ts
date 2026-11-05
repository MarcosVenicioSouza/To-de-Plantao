// Web Push (PWA) helpers: subscribe this browser and send reminders to the server.
import { backendFetch } from "@/src/utils/backend";
import { ReminderItem } from "@/src/utils/reminders";

export type WebPushStatus = "unsupported" | "needs-install" | "denied" | "default" | "granted";

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

export function webPushStatus(): WebPushStatus {
  if (typeof window === "undefined") return "unsupported";
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  return Notification.permission as WebPushStatus;
}

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export async function requestWebPushPermission(): Promise<boolean> {
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

async function getSubscription(): Promise<PushSubscription> {
  const reg = await getRegistration();
  const cur = await reg.pushManager.getSubscription();
  if (cur) return cur;
  const { public_key } = await backendFetch<{ public_key: string }>("/push/public-key");
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64ToUint8(public_key),
  });
}

export async function syncWebPush(reminders: ReminderItem[]): Promise<number> {
  const sub = await getSubscription();
  const res = await backendFetch<{ scheduled: number }>("/push/sync", {
    method: "POST",
    body: JSON.stringify({
      subscription: sub.toJSON(),
      reminders: reminders.slice(0, 500).map((r) => ({
        at: r.at.toISOString(),
        title: r.title,
        body: r.body,
      })),
    }),
  });
  return res.scheduled;
}

export async function sendWebPushTest() {
  await backendFetch("/push/test", { method: "POST" });
}

export async function disableWebPush() {
  let endpoint: string | undefined;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    endpoint = sub?.endpoint;
    await sub?.unsubscribe();
  } catch {}
  await backendFetch("/push/disable", { method: "POST", body: JSON.stringify({ endpoint }) });
}
