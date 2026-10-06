/** Provider-agnostic WhatsApp send contract. */
export type WhatsAppTemplateMessage = {
  to: string; // E.164
  templateName: string;
  languageCode?: string;
  bodyVariables?: string[];
  headerVariables?: string[];
  buttonVariables?: string[];
};

export type WhatsAppFreeformMessage = {
  to: string; // E.164
  body: string; // plain text fallback (session-window only)
};

export type WhatsAppSendResult =
  | { ok: true; messageId: string; attempts?: number; request?: unknown; raw?: unknown }
  | { ok: false; status: "failed" | "skipped"; error: string; attempts?: number; request?: unknown; raw?: unknown };

export interface WhatsAppProvider {
  readonly name: string;
  isConfigured(): boolean;
  sendTemplate(msg: WhatsAppTemplateMessage): Promise<WhatsAppSendResult>;
  sendFreeform(msg: WhatsAppFreeformMessage): Promise<WhatsAppSendResult>;
}
