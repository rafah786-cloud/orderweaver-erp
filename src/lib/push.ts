import { createIsomorphicFn } from "@tanstack/react-start";

// Keep browser-only subscription code out of the server import graph.
export const webPushSupported = createIsomorphicFn()
  .client((): boolean =>
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window,
  )
  .server((): boolean => false);

export const enableWebPushNotifications = createIsomorphicFn()
  .client(async (): Promise<{ ok: boolean; reason?: string }> => {
    const push = await import("./push.client");
    return push.enableWebPushNotifications();
  })
  .server(async (): Promise<{ ok: boolean; reason?: string }> => ({
    ok: false,
    reason: "unsupported",
  }));

export const disableWebPushNotifications = createIsomorphicFn()
  .client(async (): Promise<{ ok: boolean }> => {
    const push = await import("./push.client");
    return push.disableWebPushNotifications();
  })
  .server(async (): Promise<{ ok: boolean }> => ({ ok: true }));