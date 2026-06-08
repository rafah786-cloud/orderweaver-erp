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

const PROVIDER_NAME = "interakt";
const CHANNEL = "whatsapp";

export const getWhatsAppConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("notification_providers")
      .select("id, is_active, is_default, config, secret_env_keys, notes, updated_at")
      .eq("channel", CHANNEL)
      .eq("name", PROVIDER_NAME)
      .maybeSingle();
    const cfg = (data?.config as Record<string, unknown> | null) ?? {};
    return {
      id: data?.id ?? null,
      is_active: data?.is_active ?? false,
      is_default: data?.is_default ?? false,
      workspace_id: (cfg.workspace_id as string) ?? "",
      business_number: (cfg.business_number as string) ?? "",
      sender_name: (cfg.sender_name as string) ?? "",
      base_url: (cfg.base_url as string) ?? "https://api.interakt.ai/v1/public",
      default_language: (cfg.default_language as string) ?? "en",
      api_key_configured: Boolean(process.env.INTERAKT_API_KEY),
      updated_at: data?.updated_at ?? null,
    };
  });

export const updateWhatsAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspace_id: z.string().max(200).optional().default(""),
        business_number: z.string().max(32).optional().default(""),
        sender_name: z.string().max(120).optional().default(""),
        base_url: z.string().url().max(300).optional().default("https://api.interakt.ai/v1/public"),
        default_language: z.string().min(2).max(10).optional().default("en"),
        is_active: z.boolean().optional().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const config = {
      workspace_id: data.workspace_id,
      business_number: data.business_number,
      sender_name: data.sender_name,
      base_url: data.base_url,
      default_language: data.default_language,
    };

    const { data: existing } = await supabaseAdmin
      .from("notification_providers")
      .select("id")
      .eq("channel", CHANNEL)
      .eq("name", PROVIDER_NAME)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("notification_providers")
        .update({
          is_active: data.is_active,
          config: config as any,
          secret_env_keys: ["INTERAKT_API_KEY"] as any,
        })
        .eq("id", existing.id);
      if (error) throw error;
      return { ok: true, id: existing.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("notification_providers")
      .insert({
        channel: CHANNEL,
        name: PROVIDER_NAME,
        display_name: "Interakt (WhatsApp)",
        is_active: data.is_active,
        is_default: true,
        priority: 100,
        config: config as any,
        secret_env_keys: ["INTERAKT_API_KEY"] as any,
        notes: "Set INTERAKT_API_KEY in Project Secrets to authenticate.",
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: ins.id };
  });

export const sendTestWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        mobileNumber: z.string().min(8).max(20),
        templateName: z.string().min(1).max(200),
        variables: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { sendWhatsAppMessage } = await import("./whatsapp/send.server");
    const result = await sendWhatsAppMessage(
      data.mobileNumber,
      data.templateName,
      data.variables,
      { party_kind: "admin", event_type: "test.send" },
    );
    return result;
  });
