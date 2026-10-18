import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8")) as {
  name: string; start_url: string; scope: string; display: string; icons: { src: string }[];
};
const serviceWorker = readFileSync(new URL("../../public/push-service-worker.js", import.meta.url), "utf8");
const offlinePage = readFileSync(new URL("../../public/offline.html", import.meta.url), "utf8");
const root = readFileSync(new URL("../routes/__root.tsx", import.meta.url), "utf8");
const installPrompt = readFileSync(new URL("../components/PwaInstallPrompt.tsx", import.meta.url), "utf8");

describe("Tablet installability and offline privacy contract", () => {
  it("ships a standalone business-app manifest with valid local icon paths", () => {
    expect(manifest.name).toContain("Mattress Maestro");
    expect(manifest.start_url).toBe("/dashboard");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map(icon => icon.src)).toEqual(["/zizz-logo-192.png", "/zizz-logo-512.png"]);
  });

  it("registers the existing push worker instead of replacing its root-scoped registration", () => {
    expect(root).toContain('navigator.serviceWorker.register("/push-service-worker.js", { scope: "/" })');
    expect(serviceWorker).toContain('self.addEventListener("push"');
    expect(serviceWorker).toContain('self.addEventListener("notificationclick"');
  });

  it("never caches authenticated navigation or ERP/API responses", () => {
    expect(serviceWorker).toContain('if (request.mode === "navigate")');
    expect(serviceWorker).toContain('fetch(request).catch(async () =>');
    expect(serviceWorker).toContain('if (!isBuildAsset && !SHELL_PATHS.has(url.pathname)) return;');
    expect(offlinePage).toContain("does not cache private ERP records");
    expect(offlinePage).toContain("requires a secure connection");
  });

  it("offers a native install prompt and clear iOS Add to Home Screen guidance", () => {
    expect(installPrompt).toContain('"beforeinstallprompt"');
    expect(installPrompt).toContain('"appinstalled"');
    expect(installPrompt).toContain("Add to Home Screen");
    expect(installPrompt).toContain("Business records still require a live, authenticated connection");
  });
});
