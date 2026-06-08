import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const listNotificationProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { listProviders } = await import("./notifications/registry.server");
    return { providers: await listProviders() };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  channel: z.enum(["whatsapp", "sms", "email", "push"]),
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_-]+$/, "Lowercase letters, digits, dashes, underscores"),
  display_name: z.string().min(1).max(120),
  is_active: z.boolean().default(false),
  is_default: z.boolean().default(false),
  priority: z.number().int().min(1).max(1000).default(100),
  config: z.record(z.string(), z.any()).default({}),
  secret_env_keys: z.array(z.string().min(1).max(80)).max(10).default([]),
  notes: z.string().max(500).optional().nullable(),
});

export const upsertNotificationProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Enforce single default per channel.
    if (data.is_default) {
      await supabaseAdmin
        .from("notification_providers")
        .update({ is_default: false })
        .eq("channel", data.channel)
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("notification_providers")
        .update({
          channel: data.channel,
          name: data.name,
          display_name: data.display_name,
          is_active: data.is_active,
          is_default: data.is_default,
          priority: data.priority,
          config: data.config as any,
          secret_env_keys: data.secret_env_keys as any,
          notes: data.notes ?? null,
        })
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }

    const { data: ins, error } = await supabaseAdmin
      .from("notification_providers")
      .insert({
        channel: data.channel,
        name: data.name,
        display_name: data.display_name,
        is_active: data.is_active,
        is_default: data.is_default,
        priority: data.priority,
        config: data.config as any,
        secret_env_keys: data.secret_env_keys as any,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: ins.id };
  });

export const toggleNotificationProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("notification_providers")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteNotificationProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("notification_providers")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
