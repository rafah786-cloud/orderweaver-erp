import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin only");
}

function fail(tag: string, err: unknown, userMsg: string): never {
  console.error(`[biometric] ${tag}`, err);
  throw new Error(userMsg);
}

const DeviceSchema = z.object({
  device_id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
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
    await assertAdmin(context.userId);
    const apiKey = randomBytes(24).toString("hex");
    const api_key_hash = await bcrypt.hash(apiKey, 10);
    const { error } = await supabaseAdmin.from("device_settings").insert({ ...data, api_key_hash });
    if (error) fail("createDevice", error, "Failed to create device. Please try again.");
    return { apiKey };
  });

export const rotateDeviceKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const apiKey = randomBytes(24).toString("hex");
    const api_key_hash = await bcrypt.hash(apiKey, 10);
    const { error } = await supabaseAdmin
      .from("device_settings")
      .update({ api_key_hash })
      .eq("id", data.id);
    if (error) fail("rotateDeviceKey", error, "Failed to rotate device key. Please try again.");
    return { apiKey };
  });

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("device_settings").delete().eq("id", data.id);
    if (error) fail("deleteDevice", error, "Failed to delete device. Please try again.");
    return { ok: true };
  });
