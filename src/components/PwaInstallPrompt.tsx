import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Share, Smartphone, X } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Install entry point for supported browsers and iOS Home Screen installation.
 * This only installs the shell; private ERP records are not made available offline.
 */
export function PwaInstallPrompt() {
  const location = useLocation();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(true);
  const [iosInstructions, setIosInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandalone());
    setIosInstructions(isAppleMobile() && !isStandalone());

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setIsInstalled(isStandalone());
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onDashboard = location.pathname === "/dashboard" || location.pathname.startsWith("/dashboard/");
  if (!onDashboard || isInstalled || dismissed || (!installPrompt && !iosInstructions)) return null;

  const install = async () => {
    if (!installPrompt) return;
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
        setInstallPrompt(null);
        setDismissed(true);
      } else {
        setInstallPrompt(null);
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Card className="border-border/80">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Use Mattress Maestro like an app</h2>
          {iosInstructions ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              On iPhone or iPad, tap the browser Share button, then choose <strong>Add to Home Screen</strong>.
              Open the saved icon for a full-screen workspace.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Install the workspace on this device for a dedicated app icon and standalone window.
              Business records still require a live, authenticated connection.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {installPrompt && <Button onClick={() => void install()} disabled={installing} className="min-h-10">
            <Download className="mr-2 h-4 w-4" />{installing ? "Opening…" : "Install app"}
          </Button>}
          {iosInstructions && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Share className="h-4 w-4" />Share menu</span>}
          <Button variant="ghost" size="icon" onClick={() => setDismissed(true)} aria-label="Dismiss app installation tip"><X className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
