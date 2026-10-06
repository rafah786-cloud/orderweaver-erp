import type {
  NotificationChannel,
  NotificationProvider,
  ProviderFactory,
  ProviderRecord,
} from "./types";
import { interaktFactory } from "./providers/interakt.server";
import { stubFactory } from "./providers/stub.server";
import { inAppFactory } from "./providers/in-app.server";

/**
 * Registry of available provider implementations.
 *
 * Key format: `${channel}:${name}`. Adding a new provider means:
 *   1. Implement the `NotificationProvider` interface.
 *   2. Add one line here mapping `channel:name` → factory.
 *   3. Insert a row in the `notification_providers` table and toggle it active.
 *
 * Business logic never references these keys directly — it uses
 * `sendNotification({ channel, … })` and the registry resolves the active
 * provider from configuration.
 */
const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  "whatsapp:interakt": interaktFactory,
  // Stubs — replace with real implementations and register here.
  "sms:stub": stubFactory,
  "email:stub": stubFactory,
  "push:stub": stubFactory,
  "in_app:internal": inAppFactory,
};

function toRecord(row: any): ProviderRecord {
  return {
    id: row.id,
    channel: row.channel,
    name: row.name,
    display_name: row.display_name,
    is_active: row.is_active,
    is_default: row.is_default,
    priority: row.priority,
    config: row.config ?? {},
    secret_env_keys: Array.isArray(row.secret_env_keys) ? row.secret_env_keys : [],
    notes: row.notes,
  };
}

/** Returns the active provider for a channel, or null if none configured. */
export async function resolveProvider(
  channel: NotificationChannel,
): Promise<NotificationProvider | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("notification_providers")
    .select("*")
    .eq("channel", channel)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("priority", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const record = toRecord(data[0]);
  const factory = PROVIDER_FACTORIES[`${record.channel}:${record.name}`];
  if (!factory) return null;
  return factory(record);
}

/** Lists all providers from configuration with availability flags. */
export async function listProviders() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("notification_providers")
    .select("*")
    .order("channel", { ascending: true })
    .order("priority", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const record = toRecord(row);
    const implementation = PROVIDER_FACTORIES[`${record.channel}:${record.name}`];
    const missingEnv = record.secret_env_keys.filter((k) => !process.env[k]);
    return {
      id: record.id,
      channel: record.channel,
      name: record.name,
      display_name: record.display_name,
      is_active: record.is_active,
      is_default: record.is_default,
      priority: record.priority,
      has_implementation: Boolean(implementation),
      missing_env: missingEnv,
      ready: Boolean(implementation) && missingEnv.length === 0,
      // Return only non-secret configuration needed for the admin settings screen.
      // Secrets themselves remain in project environment variables and are never exposed.
      config:
        record.channel === "whatsapp" && record.name === "interakt"
          ? {
              workspace_id: record.config?.workspace_id ?? "",
              business_number: record.config?.business_number ?? "",
              sender_name: record.config?.sender_name ?? "",
              base_url: record.config?.base_url ?? "",
              default_language: record.config?.default_language ?? "",
            }
          : {},
      secret_env_keys: record.secret_env_keys,
    };
  });
}

export type ListedProvider = Awaited<ReturnType<typeof listProviders>>[number];
