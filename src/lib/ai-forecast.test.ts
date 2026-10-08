import { describe, expect, it } from "vitest";
import { backtestLinearForecast, linearForecast } from "./ai/erp-data.server";

describe("AI forecast validation", () => {
  it("returns no backtest when there is insufficient history", () => {
    expect(backtestLinearForecast([1, 2, 3, 4], 3)).toEqual({
      holdout: 0,
      mae: null,
      mapePct: null,
    });
  });

  it("backtests the production forecast method on a holdout window", () => {
    const series = [100, 110, 120, 130, 140, 150, 160, 170];
    const result = backtestLinearForecast(series, 3);
    expect(result.holdout).toBe(3);
    expect(result.mae).toBeLessThanOrEqual(1);
    expect(result.mapePct).toBeLessThanOrEqual(1);
  });

  it("does not produce a forecast from fewer than three observations", () => {
    expect(linearForecast([100, 110], 3).forecast).toEqual([]);
  });
});
