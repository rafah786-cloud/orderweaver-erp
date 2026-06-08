/**
 * Provider-agnostic notification abstraction.
 *
 * Adding a new channel (SMS, Email, Push) or a new provider (Twilio, Resend,
 * FCM, Gupshup, …) only requires:
 *   1. A new implementation of `NotificationProvider` in src/lib/notifications/providers/
 *   2. Registering it in `PROVIDER_FACTORIES` in registry.server.ts
 *   3. Adding/activating a row in the `notification_providers` config table
 *
 * Business logic (sales orders, invoices, dispatches, etc.) must never import
 * a concrete provider — it calls `sendNotification(...)` and the registry
 * resolves the right provider from configuration at runtime.
 */

export type NotificationChannel = "whatsapp" | "sms" | "email" | "push";

export type ProviderRecord = {
  id: string;
  channel: NotificationChannel;
  name: string;
  display_name: string;
  is_active: boolean;
  is_default: boolean;
  priority: number;
  config: Record<string, unknown>;
  secret_env_keys: string[];
  notes: string | null;
};

/** A request to send a templated notification (preferred). */
export type TemplateMessage = {
  to: string;
  templateName: string;
  languageCode?: string;
  variables?: Record<string, string | number | null | undefined>;
  /** Ordered fallback when a provider needs positional bindings. */
  bodyVariables?: string[];
  /** Optional subject for channels that support it (Email). */
  subject?: string;
};

/** A request to send a freeform message (text body). */
export type FreeformMessage = {
  to: string;
  body: string;
  subject?: string;
};

export type SendResult =
  | { ok: true; messageId: string; raw?: unknown }
  | { ok: false; status: "failed" | "skipped"; error: string; raw?: unknown };

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  readonly name: string;
  /** Returns true only when required secrets/env are present. */
  isConfigured(): boolean;
  sendTemplate(msg: TemplateMessage): Promise<SendResult>;
  sendFreeform(msg: FreeformMessage): Promise<SendResult>;
}

/** Factory signature used by the registry to instantiate a provider. */
export type ProviderFactory = (record: ProviderRecord) => NotificationProvider;
