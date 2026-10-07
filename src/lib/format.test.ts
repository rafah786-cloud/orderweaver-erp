import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, todayIndia } from "./format";

describe("ERP India time authority", () => {
  it("uses Asia/Kolkata for business dates", () => {
    // 23:55 UTC is already 05:25 IST on the following calendar day.
    expect(todayIndia(new Date("2026-10-06T23:55:00Z"))).toBe("2026-10-07");
  });

  it("renders audit timestamps in India time", () => {
    expect(formatDateTime("2026-10-06T23:55:00Z")).toContain("07 Oct 2026");
    expect(formatDateTime("2026-10-06T23:55:00Z")).toContain("05:25");
  });

  it("formats date-only values without shifting the business date", () => {
    expect(formatDate("2026-10-07")).toBe("07 Oct 2026");
  });
});
