import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Body = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/i) });
const ALLOWED_ORIGINS = new Set([
  "https://printer-pixie-suite.lovable.app",
  "https://id-preview--c49af9ce-e95f-45a9-8c8d-4a9e877e5a34.lovable.app",
]);

function headers(origin: string | null) {
  const result = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, private",
    "vary": "Origin",
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    result.set("access-control-allow-origin", origin);
    result.set("access-control-allow-methods", "POST, OPTIONS");
    result.set("access-control-allow-headers", "content-type");
  }
  return result;
}

export const Route = createFileRoute("/api/public/label-handoff/consume")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: headers(origin) });
      },
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !ALLOWED_ORIGINS.has(origin)) {
          return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: headers(null) });
        }
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "Invalid or missing handoff token" }), { status: 400, headers: headers(origin) });
        }

        const tokenHash = createHash("sha256").update(parsed.data.token, "utf8").digest("hex");
        const db: any = supabaseAdmin;
        // The conditional update makes handoffs single-use under concurrent requests.
        const { data: row, error } = await db.from("label_handoff_jobs")
          .update({ consumed_at: new Date().toISOString() })
          .eq("token_hash", tokenHash)
          .is("consumed_at", null)
          .gt("expires_at", new Date().toISOString())
          .select("payload")
          .maybeSingle();

        if (error) return new Response(JSON.stringify({ error: "Label handoff is temporarily unavailable" }), { status: 503, headers: headers(origin) });
        if (!row?.payload) return new Response(JSON.stringify({ error: "This label handoff expired or was already used. Create a new handoff from the Sales Order." }), { status: 410, headers: headers(origin) });
        return new Response(JSON.stringify(row.payload), { status: 200, headers: headers(origin) });
      },
    },
  },
});
