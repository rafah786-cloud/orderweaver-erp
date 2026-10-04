import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

function credentials() {
  const url = process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'];
  let key = process.env['SUPABASE_PUBLISHABLE_KEY'] || process.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  if (!key && process.env['SUPABASE_PUBLISHABLE_KEYS']) {
    try {
      const keys: unknown = JSON.parse(process.env['SUPABASE_PUBLISHABLE_KEYS']);
      if (keys && typeof keys === "object" && !Array.isArray(keys)) {
        key = Object.values(keys).find((value): value is string => typeof value === "string" && value.startsWith("sb_publishable_"));
      }
    } catch { /* malformed keyset: fall through to legacy key */ }
  }
  key ||= process.env['SUPABASE_ANON_KEY'] || process.env['VITE_SUPABASE_ANON_KEY'];
  if (!url || !key) throw new Error("ERP connection is not configured");
  return { url, key };
}

export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("Sign in to use ERP tools");
  const { url, key } = credentials();
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}