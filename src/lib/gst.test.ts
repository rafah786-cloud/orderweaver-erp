import { describe, expect, it } from "vitest";
import { generateReturn } from "./gst";

describe("GST return safety guards", () => {
  it("refuses to generate a placeholder GSTR-9 annual return", async () => {
    await expect(
      generateReturn({ type: "GSTR-9", year: 2026, month: 1, gstin: "", supplierStateCode: "" }),
    ).rejects.toThrow("Annual GSTR-9 generation is not available yet");
  });
});
