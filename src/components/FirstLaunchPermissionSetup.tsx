import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  enableWebPushNotifications,
  webPushSupported,
} from "@/lib/push.client";

const STORAGE_PREFIX = "mattress-maestro:first-launch-permissions:";

type PermissionState = "unknown" | "granted" | "denied";

function locationPermission(): PermissionState {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "denied";
  return "unknown";
}

export function FirstLaunchPermissionSetup({ userId }: { userId: string }) {
  const storageKey = useMemo(() => `${STORAGE_PREFIX}${userId}`, [userId]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"notifications" | "location" | null>(null);
  const [notificationState, setNotificationState] = useState<PermissionState>("unknown");
  const [locationState, setLocationState] = useState<PermissionState>(locationPermission());

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.localStorage.getItem(storageKey) === "complete") return;

    const notification =
      typeof Notification !== "undefined" ? Notification.permission : "denied";
    setNotificationState(notification === "granted" ? "granted" : notification === "denied" ? "denied" : "unknown");

    setOpen(true);
  }, [storageKey]);

  useEffect(() => {
    if (notificationState === "granted" && locationState === "granted") {
      window.localStorage.setItem(storageKey, "complete");
      setOpen(false);
    }
  }, [notificationState, locationState, storageKey]);

  if (!open) return null;

  async function requestNotifications() {
    setBusy("notifications");
    try {
      const result = await enableWebPushNotifications();
      if (result.ok) {
        setNotificationState("granted");
      } else if (result.reason === "permission_denied") {
        setNotificationState("denied");
      }
    } finally {
      setBusy(null);
    }
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationState("denied");
      return;
    }

    setBusy("location");
    navigator.geolocation.getCurrentPosition(
      () => {
        // Permission is requested here, but the coordinates are intentionally
        // not stored or transmitted by this onboarding flow.
        setLocationState("granted");
        setBusy(null);
      },
      () => {
        setLocationState("denied");
        setBusy(null);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  }

  function finishLater() {
    window.localStorage.setItem(storageKey, "dismissed");
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-launch-permissions-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-2xl sm:p-8"
      >
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl btn-gold">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 id="first-launch-permissions-title" className="text-xl font-semibold">
              Set up Mattress Maestro
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Allow the permissions needed for the full mobile-app experience. Your phone
              controls the final permission choices.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <BellRing className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">Notifications</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Receive order, production, payment, approval and other account-specific
                  alerts even when Mattress Maestro is not open.
                </p>
                {notificationState === "granted" ? (
                  <div className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-600">
                    <Check className="h-4 w-4" aria-hidden="true" /> Enabled
                  </div>
                ) : (
                  <Button
                    className="mt-3"
                    size="sm"
                    onClick={requestNotifications}
                    disabled={busy !== null || !webPushSupported()}
                  >
                    Allow notifications
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">Location</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enable location-based ERP features when they are used. This setup request
                  does not save or transmit your coordinates.
                </p>
                {locationState === "granted" ? (
                  <div className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-600">
                    <Check className="h-4 w-4" aria-hidden="true" /> Enabled
                  </div>
                ) : (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={requestLocation}
                    disabled={busy !== null}
                  >
                    Allow location
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={finishLater} disabled={busy !== null}>
            Do this later
          </Button>
          <Button
            onClick={() => {
              window.localStorage.setItem(storageKey, "complete");
              setOpen(false);
            }}
            disabled={busy !== null}
          >
            Continue to Mattress Maestro
          </Button>
        </div>
      </div>
    </div>
  );
}
