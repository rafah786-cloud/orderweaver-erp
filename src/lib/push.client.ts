import { getWebPushConfig, registerWebPushSubscription, unregisterWebPushSubscription } from "@/lib/push.functions";

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function webPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function enableWebPushNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (!webPushSupported()) return { ok: false, reason: "unsupported" };

  const config = await getWebPushConfig();
  if (!config.supported || !config.publicKey) return { ok: false, reason: "not_configured" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "permission_denied" };

  const registration = await navigator.serviceWorker.register("/push-service-worker.js", {
    scope: "/",
  });
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.publicKey),
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    return { ok: false, reason: "invalid_subscription" };
  }

  await registerWebPushSubscription({
    data: {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      expirationTime: json.expirationTime ?? null,
      userAgent: navigator.userAgent,
      deviceLabel: navigator.platform || null,
    },
  });

  return { ok: true };
}

export async function disableWebPushNotifications(): Promise<{ ok: boolean }> {
  if (!webPushSupported()) return { ok: true };
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return { ok: true };
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await unregisterWebPushSubscription({ data: { endpoint } });
  return { ok: true };
}
