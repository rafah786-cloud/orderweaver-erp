import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = {
  maintenance: readFileSync(new URL("../routes/_app.maintenance.tsx", import.meta.url), "utf8"),
  quality: readFileSync(new URL("../routes/_app.quality.tsx", import.meta.url), "utf8"),
  smartSleepTec: readFileSync(new URL("../routes/_app.smart-sleeptec.tsx", import.meta.url), "utf8"),
  shopFloor: readFileSync(new URL("../routes/_app.shop-floor.tsx", import.meta.url), "utf8"),
  shipments: readFileSync(new URL("../routes/_app.shipments.tsx", import.meta.url), "utf8"),
};

describe("Workspace controls match live database RLS", () => {
  it("only shows write controls to admins where live restrictive policies require admin", () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source, name).toContain('const canManage = hasAnyRole(["admin"]);');
      expect(source, name).toContain("The live database currently restricts writes in this workspace to approved administrators.");
    }
  });

  it("keeps routes readable but clearly explains when non-admins are read-only", () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source, name).toContain('{!canManage && <div role="note"');
      expect(source, name).toContain("editing actions are disabled until a reviewed database-policy migration is safely deployed.");
    }
  });

  it("does not broaden live database permissions or bypass RLS from the client", () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source, name).not.toContain("service_role");
      expect(source, name).not.toContain("SECURITY DEFINER");
    }
  });
});
