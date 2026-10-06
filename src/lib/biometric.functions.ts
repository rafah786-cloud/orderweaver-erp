import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(db: any, userId: string) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Admin only");
}

async function activeCompanyId(db: any): Promise<string> {
  const { data, error } = await db.rpc("current_company_id");
  if (error || !data) throw new Error("No active company selected");
  return data;
}

function fail(tag: string, err: unknown, userMsg: string): never {
  console.error(`[biometric] ${tag}`, err);
  throw new Error(userMsg);
}

const DeviceSchema = z.object({
  device_id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(120),
  ip_address: z.string().min(1).max(64),
  port: z.number().int().min(1).max(65535),
  poll_interval_ms: z.number().int().min(1000).max(600000),
  is_active: z.boolean().default(true),
});

export const createDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DeviceSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const companyId = await activeCompanyId(context.supabase);
    const apiKey = randomBytes(24).toString("hex");
    const api_key_hash = await bcrypt.hash(apiKey, 10);
    const { error } = await supabaseAdmin.from("device_settings").insert({ ...data, company_id: companyId, api_key_hash });
    if (error) fail("createDevice", error, "Failed to create device. Please try again.");
    return { apiKey };
  });

export const rotateDeviceKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const companyId = await activeCompanyId(context.supabase);
    const apiKey = randomBytes(24).toString("hex");
    const api_key_hash = await bcrypt.hash(apiKey, 10);
    const { error } = await supabaseAdmin
      .from("device_settings")
      .update({ api_key_hash })
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) fail("rotateDeviceKey", error, "Failed to rotate device key. Please try again.");
    return { apiKey };
  });

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const companyId = await activeCompanyId(context.supabase);
    const { error } = await supabaseAdmin.from("device_settings").delete().eq("id", data.id).eq("company_id", companyId);
    if (error) fail("deleteDevice", error, "Failed to delete device. Please try again.");
    return { ok: true };
  });
