import { describe, expect, it } from "vitest";
import { classifyCapabilityTableError } from "./capability-schema-status";

describe("enterprise capability schema status", () => {
  it.each([
    [{ code: "42P01", message: "relation public.mps_plans does not exist" }, "not-installed"],
    [{ code: "PGRST205", message: "Could not find the table public.maintenance_assets in the schema cache" }, "not-installed"],
    [{ message: "table not found" }, "not-installed"],
  ] as const)("identifies missing schema from %o", (error, expected) => {
    expect(classifyCapabilityTableError(error)).toBe(expected);
  });
  it.each([
    [{ code: "42501", message: "permission denied" }],
    [{ code: "PGRST301", message: "JWT expired" }],
    [new Error("network unavailable")],
    [null],
  ])("does not mislabel access or network errors as missing schema: %o", (error) => {
    expect(classifyCapabilityTableError(error)).toBe("unavailable");
  });
});
