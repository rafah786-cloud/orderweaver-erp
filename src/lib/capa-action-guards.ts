/** Validate the completion gate for a corrective/preventive action. */
export function validateCapaActionCompletion(effectivenessResult: unknown): string | null {
  if (typeof effectivenessResult !== "string" || effectivenessResult.trim().length < 10) {
    return "Record an effectiveness result of at least 10 characters before completing this action.";
  }
  return null;
}
