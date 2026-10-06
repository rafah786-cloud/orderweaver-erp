import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ChannelEnum = z.enum(["whatsapp", "sms", "email", "push", "in_app"]);

export const listNotificationEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: admin, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError || !admin) throw new Error("Forbidden");
    const [events, channels] = await Promise.all([
      supabase.from("notification_events").select("*").order("category").order("label"),
      supabase.from("notification_event_channels").select("*"),
    ]);
    if (events.error) throw events.error;
    if (channels.error) throw channels.error;
    return { events: events.data ?? [], channels: channels.data ?? [] };
  });

export const setEventChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        event_key: z.string().min(1).max(120),
        channel: ChannelEnum,
        is_enabled: z.boolean().optional(),
        template_name: z.string().max(200).nullable().optional(),
        subject_template: z.string().max(500).nullable().optional(),
        body_template: z.string().max(4000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: admin, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError || !admin) throw new Error("Forbidden");
    const { error } = await supabase.from("notification_event_channels").upsert(
      {
        event_key: data.event_key,
        channel: data.channel,
        is_enabled: data.is_enabled ?? false,
        template_name: data.template_name ?? null,
        subject_template: data.subject_template ?? null,
        body_template: data.body_template ?? null,
      },
      { onConflict: "event_key,channel" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const toggleEventActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ event_key: z.string(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: admin, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError || !admin) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("notification_events")
      .update({ is_active: data.is_active })
      .eq("event_key", data.event_key);
    if (error) throw error;
    return { ok: true };
  });

export const listMyInAppNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("in_app_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const markInAppRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let q = supabase.from("in_app_notifications").update({ read_at: new Date().toISOString() });
    if (data.id) q = q.eq("id", data.id);
    else q = q.is("read_at", null);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });

export const dispatchTestEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        event_key: z.string().min(1).max(120),
        phone: z.string().max(32).optional(),
        email: z.string().email().max(320).optional(),
        user_ids: z.array(z.string().uuid()).max(1).optional(),
        variables: z.record(z.string(), z.any()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError || !admin) throw new Error("Forbidden");

    const { data: eventRow, error: eventError } = await context.supabase
      .from("notification_events")
      .select("event_key, is_active")
      .eq("event_key", data.event_key)
      .eq("is_active", true)
      .maybeSingle();
    if (eventError || !eventRow) throw new Error("Notification event is not active");

    const recipientCount =
      Number(Boolean(data.phone)) +
      Number(Boolean(data.email)) +
      Number((data.user_ids ?? []).length > 0);
    if (recipientCount !== 1) throw new Error("Select exactly one test recipient");

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError || !profile?.email) throw new Error("Unable to verify the test recipient");

    if (data.phone) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: provider } = await supabaseAdmin
        .from("notification_providers")
        .select("config")
        .eq("channel", "whatsapp")
        .eq("name", "interakt")
        .maybeSingle();
      const cfg = (provider?.config as Record<string, unknown> | null) ?? {};
      const configured = String(cfg.business_number ?? "").replace(/[\s\-()]/g, "");
      const requested = data.phone.replace(/[\s\-()]/g, "");
      if (!configured || requested !== configured) {
        throw new Error("WhatsApp test messages are restricted to the configured business number");
      }
    } else if (data.email) {
      if (data.email.toLowerCase() !== profile.email.toLowerCase()) {
        throw new Error("Email test messages are restricted to your signed-in admin email");
      }
    } else {
      const requested = data.user_ids?.[0];
      if (requested !== context.userId) {
        throw new Error("In-app test messages are restricted to your signed-in admin account");
      }
    }

    const { dispatchNotificationEvent } = await import("@/lib/notifications/engine.server");
    return dispatchNotificationEvent({
      eventKey: data.event_key,
      recipients: {
        phone: data.phone || null,
        email: data.email || null,
        userIds: data.user_ids ?? [],
      },
      variables: data.variables ?? {},
    });
  });