import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { enableWebPushNotifications, disableWebPushNotifications, webPushSupported } from "@/lib/push";

export function PushNotificationSetup() {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);

  // Reflect the browser's persisted subscription after refresh/remount instead of
  // always showing "Enable push" when the device is already subscribed.
  useEffect(() => {
    if (!webPushSupported()) return;

    let cancelled = false;
    async function syncSubscriptionState() {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (!cancelled) setEnabled(Boolean(subscription));
      } catch {
        // Keep the control usable if the browser cannot inspect its subscription.
        if (!cancelled) setEnabled(false);
      }
    }

    void syncSubscriptionState();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!webPushSupported()) return null;

  async function enable() {
    setBusy(true);
    try {
      const result = await enableWebPushNotifications();
      if (result.ok) {
        setEnabled(true);
        toast.success("Push notifications enabled on this device.");
      } else if (result.reason === "permission_denied") {
        toast.error("Notification permission was denied. Enable it in device/browser settings.");
      } else if (result.reason === "not_configured") {
        toast.error("Push service is not configured yet.");
      } else {
        toast.error("Could not enable push notifications.");
      }
    } catch (error: any) {
      toast.error(error?.message ?? "Could not enable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await disableWebPushNotifications();
      setEnabled(false);
      toast.success("Push notifications disabled on this device.");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not disable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {enabled ? (
        <Button size="sm" variant="outline" onClick={disable} disabled={busy}>
          <BellOff className="mr-1.5 h-4 w-4" />
          Disable push
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={enable} disabled={busy}>
          <BellRing className="mr-1.5 h-4 w-4" />
          Enable push
        </Button>
      )}
    </div>
  );
}
