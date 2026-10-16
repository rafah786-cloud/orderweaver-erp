import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationFiles = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
  .filter((file) => file.endsWith(".sql"));

describe("Supabase migration version integrity", () => {
  it("gives every migration a unique 14-digit version prefix", () => {
    const versions = migrationFiles.map((file) => ({
      file,
      version: file.slice(0, 14),
    }));

    for (const entry of versions) {
      expect(entry.version, `Invalid migration version: ${entry.file}`).toMatch(/^\d{14}$/);
    }

    const seen = new Map<string, string>();
    for (const entry of versions) {
      const prior = seen.get(entry.version);
      expect(prior, `Duplicate migration version ${entry.version}: ${prior} and ${entry.file}`).toBeUndefined();
      seen.set(entry.version, entry.file);
    }
  });
});
