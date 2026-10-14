export type FoamBunStatus = "curing" | "released" | "quarantined" | "consumed" | "rejected";

export interface FoamBunCureRecord {
  id: string;
  companyId: string;
  status: FoamBunStatus;
  cureStartedAt: string;
  requiredCureHours: number;
  releasedAt: string | null;
}

export interface FoamBunLineageEdge {
  parentBunLotId: string;
  childBunLotId: string;
  companyId: string;
  quantity: number;
  unit: string;
}

export function cureReadyAt(lot: Pick<FoamBunCureRecord, "cureStartedAt" | "requiredCureHours">): Date {
  const startedAt = Date.parse(lot.cureStartedAt);
  if (!Number.isFinite(startedAt)) throw new Error("Curing start timestamp must be valid.");
  if (!Number.isFinite(lot.requiredCureHours) || lot.requiredCureHours < 0) {
    throw new Error("Required curing hours must be finite and non-negative.");
  }
  return new Date(startedAt + lot.requiredCureHours * 60 * 60 * 1000);
}

export function assertFoamBunCanRelease(lot: FoamBunCureRecord, releasedAt: string): void {
  const releaseMs = Date.parse(releasedAt);
  if (!Number.isFinite(releaseMs)) throw new Error("Release timestamp must be valid.");
  if (lot.status === "rejected" || lot.status === "consumed") {
    throw new Error("Rejected or consumed foam buns cannot be released.");
  }
  if (releaseMs < cureReadyAt(lot).getTime()) {
    throw new Error("Minimum curing interval has not elapsed.");
  }
}

export function assertFoamBunCanConsume(lot: FoamBunCureRecord, companyId: string, at: string): void {
  if (!lot.id || !companyId || lot.companyId !== companyId) {
    throw new Error("Foam bun lot is not in the active company.");
  }
  if (lot.status !== "released" || !lot.releasedAt) {
    throw new Error("Foam bun is quarantined or not released.");
  }
  const atMs = Date.parse(at);
  const releaseMs = Date.parse(lot.releasedAt);
  if (!Number.isFinite(atMs) || !Number.isFinite(releaseMs)) {
    throw new Error("Consumption and release timestamps must be valid.");
  }
  const readyMs = cureReadyAt(lot).getTime();
  if (releaseMs < readyMs || atMs < readyMs || atMs < releaseMs) {
    throw new Error("Foam bun cannot be consumed before curing and recorded release.");
  }
}

export function assertFoamBunLineageValid(
  edge: FoamBunLineageEdge,
  parent: FoamBunCureRecord,
  child: FoamBunCureRecord,
  existingEdges: FoamBunLineageEdge[],
  at: string,
): void {
  if (!edge.companyId || edge.companyId !== parent.companyId || edge.companyId !== child.companyId) {
    throw new Error("Parent, child, and lineage must belong to the same company.");
  }
  if (!edge.parentBunLotId || !edge.childBunLotId || edge.parentBunLotId === edge.childBunLotId ||
      edge.parentBunLotId !== parent.id || edge.childBunLotId !== child.id) {
    throw new Error("Invalid parent-child foam bun lineage.");
  }
  if (!Number.isFinite(edge.quantity) || edge.quantity <= 0 || !edge.unit.trim()) {
    throw new Error("Lineage quantity must be positive and its unit explicit.");
  }
  assertFoamBunCanConsume(parent, edge.companyId, at);
  const adjacency = new Map<string, string[]>();
  for (const existing of existingEdges) {
    const children = adjacency.get(existing.parentBunLotId) ?? [];
    children.push(existing.childBunLotId);
    adjacency.set(existing.parentBunLotId, children);
  }
  const pending = [edge.childBunLotId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === edge.parentBunLotId) throw new Error("Foam bun lineage cycle rejected.");
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
}
