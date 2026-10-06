import type {
  NotificationProvider,
  ProviderFactory,
  ProviderRecord,
  SendResult,
} from "../types";

/**
 * Generic "not configured yet" provider. Used as a placeholder for channels
 * (SMS / Email / Push) until a real provider implementation is registered.
 * Always returns `skipped` so business logic does not break.
 */
export const stubFactory: ProviderFactory = (record: ProviderRecord): NotificationProvider => ({
  channel: record.channel,
  name: record.name,
  isConfigured() {
    return false;
  },
  async sendTemplate(): Promise<SendResult> {
    return { ok: false, status: "skipped", error: `${record.channel} provider not configured` };
  },
  async sendFreeform(): Promise<SendResult> {
    return { ok: false, status: "skipped", error: `${record.channel} provider not configured` };
  },
});
