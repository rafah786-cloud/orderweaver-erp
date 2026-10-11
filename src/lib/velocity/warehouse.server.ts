import { VelocityApiError } from "./http.server";

/** The official warehouse page documents creation, not a list response contract.
 * Do not probe guessed URLs or persist fabricated warehouse identifiers.
 * Existing mirrored rows remain available through listVelocityWarehouses.
 */
export async function syncVelocityWarehouses(): Promise<{ synced: number }> {
  throw new VelocityApiError("UNDOCUMENTED_ENDPOINT");
}
