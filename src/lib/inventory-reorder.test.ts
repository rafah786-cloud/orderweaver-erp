import { describe, expect, it } from "vitest";
import { buildReorderSuggestions } from "./inventory-reorder";

describe("buildReorderSuggestions", () => {
  it("suggests top-up to max under min-max policy", () => {
    const result = buildReorderSuggestions([
      {
        itemId: "1",
        itemName: "Foam sheet",
        unit: "sheet",
        onHand: 10,
        onOrder: 5,
        reorderLevel: 20,
        maxLevel: 50,
        policy: "min_max",
      },
    ]);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].suggestedOrderQty).toBe(35);
  });

  it("uses fixed reorder quantity at reorder point", () => {
    const result = buildReorderSuggestions([
      {
        itemId: "2",
        itemName: "Spring wire",
        unit: "kg",
        onHand: 3,
        onOrder: 0,
        reorderLevel: 10,
        reorderQty: 25,
        policy: "reorder_point",
      },
    ]);
    expect(result.suggestions[0].suggestedOrderQty).toBe(25);
  });

  it("skips items already covered by on-hand + on-order", () => {
    const result = buildReorderSuggestions([
      {
        itemId: "3",
        itemName: "Fabric",
        unit: "m",
        onHand: 40,
        onOrder: 10,
        reorderLevel: 30,
        maxLevel: 60,
      },
    ]);
    expect(result.suggestions).toHaveLength(0);
  });

  it("skips invalid rows instead of inventing quantities", () => {
    const result = buildReorderSuggestions([
      {
        itemId: "",
        itemName: "Bad",
        unit: "u",
        onHand: -1,
        onOrder: 0,
        reorderLevel: 5,
      },
    ]);
    expect(result.skippedInvalid).toBe(1);
    expect(result.suggestions).toHaveLength(0);
  });
});
