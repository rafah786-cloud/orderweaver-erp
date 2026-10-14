import { describe, expect, it } from "vitest";
import {
  assertFoamBunCanConsume,
  assertFoamBunCanRelease,
  assertFoamBunLineageValid,
  cureReadyAt,
  type FoamBunCureRecord,
  type FoamBunLineageEdge,
} from "./foam-bun-curing";

const parent: FoamBunCureRecord = {
  id: "bun-parent",
  companyId: "company-a",
  status: "released",
  cureStartedAt: "2026-10-01T00:00:00.000Z",
  requiredCureHours: 48,
  releasedAt: "2026-10-03T00:00:00.000Z",
  unit: "slab",
};
const child: FoamBunCureRecord = {
  id: "bun-child",
  companyId: "company-a",
  status: "curing",
  cureStartedAt: "2026-10-03T00:00:00.000Z",
  requiredCureHours: 48,
  releasedAt: null,
  unit: "slab",
};
const edge: FoamBunLineageEdge = {
  parentBunLotId: parent.id,
  childBunLotId: child.id,
  companyId: "company-a",
  quantity: 3,
  unit: "slab",
};

describe("foam bun curing and genealogy guards", () => {
  it("calculates the earliest cure-ready instant", () => {
    expect(cureReadyAt(parent).toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });

  it("rejects release before the minimum cure interval", () => {
    expect(() => assertFoamBunCanRelease(parent, "2026-10-02T23:59:59.999Z"))
      .toThrow(/curing interval/);
  });

  it("allows release at the cure boundary", () => {
    expect(() => assertFoamBunCanRelease(parent, "2026-10-03T00:00:00.000Z")).not.toThrow();
  });

  it("blocks consumption while curing or quarantined", () => {
    expect(() => assertFoamBunCanConsume({ ...parent, status: "curing" }, "company-a", "2026-10-04T00:00:00Z"))
      .toThrow(/not released/);
    expect(() => assertFoamBunCanConsume({ ...parent, status: "quarantined" }, "company-a", "2026-10-04T00:00:00Z"))
      .toThrow(/not released/);
  });

  it("rejects cross-company use and consumption before release", () => {
    expect(() => assertFoamBunCanConsume(parent, "company-b", "2026-10-04T00:00:00Z"))
      .toThrow(/active company/);
    expect(() => assertFoamBunCanConsume(parent, "company-a", "2026-10-02T00:00:00Z"))
      .toThrow(/before curing/);
  });

  it("rejects malformed timestamps and invalid curing duration", () => {
    expect(() => cureReadyAt({ cureStartedAt: "not-a-date", requiredCureHours: 48 })).toThrow(/timestamp/);
    expect(() => cureReadyAt({ cureStartedAt: "2026-10-01T00:00:00Z", requiredCureHours: -1 })).toThrow(/non-negative/);
  });

  it("allows valid same-company remnant lineage from a cured parent", () => {
    expect(() => assertFoamBunLineageValid(edge, parent, child, [], "2026-10-04T00:00:00Z")).not.toThrow();
  });

  it("rejects self lineage, cross-company lineage, invalid quantity, unit mismatch, and cycles", () => {
    expect(() => assertFoamBunLineageValid({ ...edge, childBunLotId: parent.id }, parent, child, [], "2026-10-04T00:00:00Z"))
      .toThrow(/Invalid parent-child/);
    expect(() => assertFoamBunLineageValid({ ...edge, companyId: "company-b" }, parent, child, [], "2026-10-04T00:00:00Z"))
      .toThrow(/same company/);
    expect(() => assertFoamBunLineageValid({ ...edge, quantity: 0 }, parent, child, [], "2026-10-04T00:00:00Z"))
      .toThrow(/positive/);
    expect(() => assertFoamBunLineageValid({ ...edge, unit: "kg" }, parent, child, [], "2026-10-04T00:00:00Z"))
      .toThrow(/units/);
    expect(() => assertFoamBunLineageValid(edge, parent, child, [{
      parentBunLotId: child.id, childBunLotId: parent.id, companyId: "company-a", quantity: 1, unit: "slab",
    }], "2026-10-04T00:00:00Z")).toThrow(/cycle/);
  });
});
