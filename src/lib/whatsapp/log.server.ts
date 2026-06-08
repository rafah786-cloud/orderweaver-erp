export type WhatsAppLogParams = {
  party_kind: "customer" | "vendor" | "staff" | "admin";
  party_id?: string | null;
  recipient_phone?: string | null;
  event_type: string;
  template_name?: string | null;
  ref_table?: string | null;
  ref_id?: string | null;
  status: "sent" | "failed" | "skipped";
  whatsapp_message_id?: string | null;
  failure_reason?: string | null;
  error?: string | null;
  payload?: Record<string, unknown> | null;
};

export async function logWhatsAppNotification(p: WhatsAppLogParams) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("notification_log").insert({
    channel: "whatsapp",
    party_kind: p.party_kind,
    party_id: p.party_id ?? null,
    recipient_phone: p.recipient_phone ?? null,
    event_type: p.event_type,
    template_name: p.template_name ?? null,
    ref_table: p.ref_table ?? null,
    ref_id: p.ref_id ?? null,
    status: p.status,
    whatsapp_message_id: p.whatsapp_message_id ?? null,
    failure_reason: p.failure_reason ?? p.error ?? null,
    error: p.error ?? null,
    payload: (p.payload ?? null) as any,
  });
}
