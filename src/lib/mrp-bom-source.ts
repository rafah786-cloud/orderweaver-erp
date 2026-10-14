export interface BomRevisionCandidate {
  id: string;
  model_id: string;
  revision: string;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
}

export interface EffectiveBomRevisionSelection {
  selectedByModel: Map<string, BomRevisionCandidate>;
  missingEffectiveRevisionModelIds: string[];
}

/**
 * Select only explicitly released revisions with an explicit start date inside
 * the effective window. If a model has any revision records but no effective
 * released revision, fail closed instead of silently falling back to legacy BOM.
 */
export function selectEffectiveReleasedBomRevisions(
  modelIds: string[],
  revisions: BomRevisionCandidate[],
  today: string,
): EffectiveBomRevisionSelection {
  const byModel = new Map<string, BomRevisionCandidate[]>();
  for (const revision of revisions) {
    const rows = byModel.get(revision.model_id) ?? [];
    rows.push(revision);
    byModel.set(revision.model_id, rows);
  }

  const selectedByModel = new Map<string, BomRevisionCandidate>();
  const missingEffectiveRevisionModelIds: string[] = [];
  for (const modelId of modelIds) {
    const candidates = byModel.get(modelId) ?? [];
    if (!candidates.length) continue;

    const effective = candidates
      .filter((revision) =>
        revision.status === "released" &&
        Boolean(revision.effective_from) &&
        revision.effective_from! <= today &&
        (!revision.effective_to || revision.effective_to >= today)
      )
      .sort((a, b) => (b.effective_from ?? "").localeCompare(a.effective_from ?? ""));

    if (effective[0]) selectedByModel.set(modelId, effective[0]);
    else missingEffectiveRevisionModelIds.push(modelId);
  }
  return { selectedByModel, missingEffectiveRevisionModelIds };
}
