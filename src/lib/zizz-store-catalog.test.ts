import { describe, expect, it } from "vitest";
import { mattressModels } from "./zizz-store-catalog";

describe("Zizz draft storefront catalogue", () => {
  it("keeps the supplied model names without inventing customer-facing SKU codes", () => {
    expect(mattressModels).toHaveLength(23);
    expect(new Set(mattressModels.map((model) => model.slug)).size).toBe(23);

    for (const model of mattressModels) {
      expect(model.status).toBe("draft");
      expect(model.tier).toBe("unassigned");
      expect("code" in model).toBe(false);
    }
  });
});
