import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { serviceabilityInput, serviceabilityResponse, ratesInput, forwardRatesResponse, returnRatesResponse } from "./velocity/schemas";

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const [approved, role] = await Promise.all([
    supabase.rpc("is_approved", { _user_id: userId }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (approved.error || role.error || approved.data !== true || role.data !== true) throw new Error("Forbidden");
}

export const testVelocityAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).strict().parse(input ?? {}))
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { checkVelocityAuth } = await import("./velocity/auth.server");
    // A cached token is not evidence that the provider has accepted it.
    return checkVelocityAuth();
  });

export const syncVelocityWarehouses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { syncVelocityWarehouses: sync } = await import("./velocity/warehouse.server");
    const { safeVelocityFailure } = await import("./velocity/http.server");
    try { return { ok: true as const, synced: (await sync()).synced, error: null, code: null }; }
    catch (error) { const failure = safeVelocityFailure(error); return { ok: false as const, synced: 0, error: failure.message, code: failure.code }; }
  });

export const listVelocityWarehouses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("velocity_warehouses")
      .select("id, velocity_id, name, contact_person, phone, email, address_line1, address_line2, city, state, pincode, country, is_active, last_synced_at")
      .order("name");
    if (error) throw new Error("Saved Velocity warehouses could not be loaded.");
    return data ?? [];
  });

export const testVelocityServiceability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => serviceabilityInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { velocityRequest } = await import("./velocity/client.server");
    const { safeVelocityFailure, VelocityApiError } = await import("./velocity/http.server");
    const start = Date.now();
    const correlationId = crypto.randomUUID();
    try {
      const response = await velocityRequest("/custom/api/v1/serviceability", data);
      const parsed = serviceabilityResponse.safeParse(response.body);
      if (!parsed.success) throw new VelocityApiError("INVALID_RESPONSE");
      return { ok: true, correlationId, checkedAt: new Date().toISOString(), durationMs: Date.now() - start, retried: response.retried, error: null, result: parsed.data.result };
    } catch (error) {
      return { ok: false, correlationId, checkedAt: new Date().toISOString(), durationMs: Date.now() - start, retried: false, error: safeVelocityFailure(error), result: null };
    }
  });

export const testVelocityRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ratesInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { velocityRequest } = await import("./velocity/client.server");
    const { safeVelocityFailure, VelocityApiError } = await import("./velocity/http.server");
    const start = Date.now();
    const correlationId = crypto.randomUUID();
    try {
      const response = await velocityRequest("/custom/api/v1/rates", data);
      const parsed = (data.journey_type === "forward" ? forwardRatesResponse : returnRatesResponse).safeParse(response.body);
      if (!parsed.success) throw new VelocityApiError("INVALID_RESPONSE");
      return { ok: true, correlationId, checkedAt: new Date().toISOString(), durationMs: Date.now() - start, retried: response.retried, error: null, result: parsed.data.result };
    } catch (error) {
      return { ok: false, correlationId, checkedAt: new Date().toISOString(), durationMs: Date.now() - start, retried: false, error: safeVelocityFailure(error), result: null };
    }
  });
