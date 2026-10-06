/**
 * sendWhatsAppMessage — reusable server-only helper to send a WhatsApp template
 * via the active provider (Interakt). Handles:
 *   - phone normalization
 *   - template lookup (variable order pulled from whatsapp_templates)
 *   - 3-attempt retry inside the provider on 5xx / network errors
 *   - full request/response logging into notification_log
 *
 * Returns the messageId on success, and includes attempt count + error context
 * on failure. Always logs an audit row (status: sent | failed | skipped).
 */

export type SendWhatsAppOptions = {
  party_kind?: "customer" | "vendor" | "staff" | "admin";
  party_id?: string | null;
  event_type?: string; // for audit log; defaults to template name
  ref_table?: string | null;
  ref_id?: string | null;
  languageCode?: string;
};

export type SendWhatsAppResult = {
  ok: boolean;
  messageId: string;
  status: "sent" | "failed" | "skipped";
  attempts: number;
  error?: string;
  request?: unknown;
  response?: unknown;
};

export async function sendWhatsAppMessage(
  mobileNumber: string,
  templateName: string,
  variables: Record<string, string | number | null | undefined> = {},
  options: SendWhatsAppOptions = {},
): Promise<SendWhatsAppResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { logWhatsAppNotification } = await import("./log.server");
  const { getWhatsAppProvider } = await import("./provider.server");

  const eventType = options.event_type ?? `manual:${templateName}`;
  const partyKind = options.party_kind ?? "admin";

  // 1. Resolve template — variables array dictates body order Interakt expects.
  const { data: tpl } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("template_name, language_code, variables, is_active")
    .eq("template_name", templateName)
    .maybeSingle();

  if (tpl && tpl.is_active === false) {
    await logWhatsAppNotification({
      party_kind: partyKind,
      party_id: options.party_id ?? null,
      recipient_phone: mobileNumber,
      event_type: eventType,
      template_name: templateName,
      ref_table: options.ref_table ?? null,
      ref_id: options.ref_id ?? null,
      status: "skipped",
      failure_reason: "template inactive",
      payload: { variables },
    });
    return { ok: false, messageId: "", status: "skipped", attempts: 0, error: "template inactive" };
  }

  const varOrder: string[] = Array.isArray(tpl?.variables) ? (tpl!.variables as string[]) : [];
  const bodyValues = varOrder.length
    ? varOrder.map((k) => String(variables[k] ?? ""))
    : Object.values(variables).map((v) => String(v ?? ""));

  // 2. Send via active provider (with built-in 3-attempt retry)
  const provider = await getWhatsAppProvider();
  if (!provider.isConfigured()) {
    await logWhatsAppNotification({
      party_kind: partyKind,
      party_id: options.party_id ?? null,
      recipient_phone: mobileNumber,
      event_type: eventType,
      template_name: templateName,
      ref_table: options.ref_table ?? null,
      ref_id: options.ref_id ?? null,
      status: "skipped",
      failure_reason: "provider not configured",
      payload: { variables },
    });
    return { ok: false, messageId: "", status: "skipped", attempts: 0, error: "provider not configured" };
  }

  const result = await provider.sendTemplate({
    to: mobileNumber,
    templateName,
    languageCode: options.languageCode ?? tpl?.language_code ?? "en",
    bodyVariables: bodyValues,
  });

  // 3. Log full request/response audit row
  const attempts = (result as { attempts?: number }).attempts ?? 1;
  const request = (result as { request?: unknown }).request;
  const response = (result as { raw?: unknown }).raw;

  await logWhatsAppNotification({
    party_kind: partyKind,
    party_id: options.party_id ?? null,
    recipient_phone: mobileNumber,
    event_type: eventType,
    template_name: templateName,
    ref_table: options.ref_table ?? null,
    ref_id: options.ref_id ?? null,
    status: result.ok ? "sent" : result.status,
    whatsapp_message_id: result.ok ? result.messageId : null,
    failure_reason: result.ok ? null : result.error,
    payload: { variables, attempts, request, response },
  });

  if (result.ok) {
    return { ok: true, messageId: result.messageId, status: "sent", attempts, request, response };
  }
  return {
    ok: false,
    messageId: "",
    status: result.status,
    attempts,
    error: result.error,
    request,
    response,
  };
}
