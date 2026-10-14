import { describe, expect, it } from "vitest";
import {
  calculateMattressDimensions,
  formatMattressDimensionsMm,
} from "./mattress-dimensions";

describe("mattress dimensional CPQ foundation", () => {
  it("calculates surface area and volume from millimetres", () => {
    expect(
      calculateMattressDimensions({ lengthMm: 2000, widthMm: 1800, thicknessMm: 250 }),
    ).toEqual({ surfaceAreaM2: 3.6, volumeM3: 0.9 });
  });

  it("formats dimensions as a stable human-readable order size", () => {
    expect(formatMattressDimensionsMm({ lengthMm: 2000, widthMm: 1800, thicknessMm: 250 }))
      .toBe("2000 × 1800 × 250 mm");
  });

  it.each([
    { lengthMm: 0, widthMm: 900, thicknessMm: 200 },
    { lengthMm: -1, widthMm: 900, thicknessMm: 200 },
    { lengthMm: 1800, widthMm: Number.NaN, thicknessMm: 200 },
    { lengthMm: 1800, widthMm: 900, thicknessMm: Number.POSITIVE_INFINITY },
  ])("rejects invalid dimensions: %o", (dimensions) => {
    expect(() => calculateMattressDimensions(dimensions)).toThrow(/positive finite measurement/);
  });
});
