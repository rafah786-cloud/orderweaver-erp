import { describe, expect, it } from "vitest";
import { APP_RELEASE_CHECKPOINT } from "./release-checkpoint";

describe("production release checkpoint", () => {
  it("has a stable smoke-test token that can be confirmed in published HTML", () => {
    expect(APP_RELEASE_CHECKPOINT).toBe("mm-erp-release-check-2026-10-14-r8");
    expect(APP_RELEASE_CHECKPOINT).toMatch(/^mm-erp-release-check-\d{4}-\d{2}-\d{2}-r\d+$/);
  });
});
