/**
 * Backwards-compatible shim. The WhatsApp provider is now resolved from the
 * generic notification registry (src/lib/notifications). New code should
 * call `sendNotification('whatsapp', …)` from `@/lib/notifications/send.server`
 * instead of using this directly.
 */
import type { NotificationProvider } from "../notifications/types";
import { resolveProvider } from "../notifications/registry.server";

export type WhatsAppProvider = {
  readonly name: string;
  isConfigured(): boolean;
  sendTemplate(msg: {
    to: string;
    templateName: string;
    languageCode?: string;
    bodyVariables?: string[];
  }): Promise<
    { ok: true; messageId: string } | { ok: false; status: "failed" | "skipped"; error: string }
  >;
  sendFreeform(msg: {
    to: string;
    body: string;
  }): Promise<
    { ok: true; messageId: string } | { ok: false; status: "failed" | "skipped"; error: string }
  >;
};

function wrap(p: NotificationProvider): WhatsAppProvider {
  return {
    name: p.name,
    isConfigured: () => p.isConfigured(),
    sendTemplate: (m) =>
      p.sendTemplate({
        to: m.to,
        templateName: m.templateName,
        languageCode: m.languageCode,
        bodyVariables: m.bodyVariables,
      }) as any,
    sendFreeform: (m) => p.sendFreeform({ to: m.to, body: m.body }) as any,
  };
}

const DISABLED: WhatsAppProvider = {
  name: "none",
  isConfigured: () => false,
  sendTemplate: async () => ({
    ok: false,
    status: "skipped",
    error: "No active WhatsApp provider configured",
  }),
  sendFreeform: async () => ({
    ok: false,
    status: "skipped",
    error: "No active WhatsApp provider configured",
  }),
};

/** @deprecated Use sendNotification('whatsapp', …) from notifications/send.server. */
export async function getWhatsAppProvider(): Promise<WhatsAppProvider> {
  const p = await resolveProvider("whatsapp");
  return p ? wrap(p) : DISABLED;
}
