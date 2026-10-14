export type EcoStatus = "draft" | "review" | "approved" | "released" | "rejected" | "cancelled";
export type BomRevisionStatus = "draft" | "review" | "approved" | "released" | "obsolete";

export interface EcoSnapshot {
  id: string;
  companyId: string;
  status: EcoStatus;
  requestedBy: string | null;
  approvedBy: string | null;
  effectiveFrom: string | null;
  releasedAt: string | null;
  lineCount: number;
  allLinesHaveReason: boolean;
}

export interface BomReleaseSnapshot {
  companyId: string;
  status: BomRevisionStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  changeOrder: EcoSnapshot | null;
  changeOrderReferencesRevision: boolean;
}

const ECO_TRANSITIONS: Record<EcoStatus, readonly EcoStatus[]> = {
  draft: ["draft", "review", "cancelled"],
  review: ["review", "approved", "rejected", "cancelled"],
  approved: ["approved", "released", "cancelled"],
  released: ["released"],
  rejected: ["rejected"],
  cancelled: ["cancelled"],
};

const BOM_TRANSITIONS: Record<BomRevisionStatus, readonly BomRevisionStatus[]> = {
  draft: ["draft", "review"],
  review: ["review", "approved", "obsolete"],
  approved: ["approved", "released", "obsolete"],
  released: ["released", "obsolete"],
  obsolete: ["obsolete"],
};

export function validateEcoTransition(
  current: EcoStatus,
  next: EcoStatus,
  eco: Omit<EcoSnapshot, "status">,
  today: string,
): string | null {
  if (!ECO_TRANSITIONS[current].includes(next)) return `ECO cannot transition from ${current} to ${next}.`;
  if (current === "released" && next !== "released") return "Released ECOs are immutable; create a follow-up ECO.";
  if (next === "approved" && current !== "approved") {
    if (!eco.requestedBy || !eco.approvedBy) return "Approval requires both requester and approver identity.";
    if (eco.requestedBy === eco.approvedBy) return "The requester cannot approve their own ECO.";
    if (!eco.effectiveFrom || !isIsoDate(eco.effectiveFrom)) return "Approval requires a valid effective date.";
    if (eco.lineCount < 1) return "Approval requires at least one change line.";
    if (!eco.allLinesHaveReason) return "Every ECO line requires a change reason.";
  }
  if (next === "released" && current !== "released") {
    if (!eco.approvedBy || !eco.requestedBy || eco.approvedBy === eco.requestedBy) return "Release requires independent approval.";
    if (!eco.effectiveFrom || !isIsoDate(eco.effectiveFrom)) return "Release requires a valid effective date.";
    if (eco.effectiveFrom > today) return "A future-effective ECO cannot be released for use yet.";
    if (eco.lineCount < 1 || !eco.allLinesHaveReason) return "Release requires complete, reasoned change lines.";
  }
  return null;
}

export function validateBomRevisionRelease(
  revision: BomReleaseSnapshot,
  today: string,
): string | null {
  if (revision.status !== "approved" && revision.status !== "released") {
    return "Only an approved BOM revision may be released.";
  }
  if (!revision.effectiveFrom || !isIsoDate(revision.effectiveFrom)) return "BOM release requires a valid effective-from date.";
  if (revision.effectiveFrom > today) return "A future-effective BOM revision cannot be released for use yet.";
  if (revision.effectiveTo && (!isIsoDate(revision.effectiveTo) || revision.effectiveTo < revision.effectiveFrom)) {
    return "BOM effective-to must be on or after effective-from.";
  }
  const eco = revision.changeOrder;
  if (!eco) return "A released BOM revision must reference a released engineering change order.";
  if (eco.companyId !== revision.companyId) return "BOM revision and ECO must belong to the same company.";
  if (eco.status !== "released" || !eco.releasedAt) return "The linked ECO must be released before the BOM revision.";
  if (!eco.approvedBy || !eco.requestedBy || eco.approvedBy === eco.requestedBy) return "The linked ECO must have independent approval.";
  if (eco.effectiveFrom !== revision.effectiveFrom) return "BOM and ECO effective dates must match.";
  if (eco.lineCount < 1 || !eco.allLinesHaveReason || !revision.changeOrderReferencesRevision) {
    return "The linked ECO must contain a reasoned change line for this BOM revision.";
  }
  return null;
}

export function isReleasedEngineeringArtifactImmutable(
  status: EcoStatus | BomRevisionStatus,
): boolean {
  return status === "released" || status === "obsolete";
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
