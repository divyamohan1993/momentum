import { api } from "./client";

/** Best-effort Web Push enrollment (§16.2). Returns true once subscribed. */
export async function registerPush(flash?: (m: string) => void): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    flash?.("Push isn't supported in this browser");
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      flash?.("Notifications were blocked");
      return false;
    }
    const { key, enabled } = await api.pushKey();
    if (!enabled || !key) {
      flash?.("Push isn't configured on the server yet");
      return false;
    }
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }));
    await api.subscribe(sub.toJSON());
    return true;
  } catch {
    flash?.("Couldn't enable alarms");
    return false;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
