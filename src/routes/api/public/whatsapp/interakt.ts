import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Interakt status webhook. Configure in Interakt dashboard:
 *   URL:    https://<your-domain>/api/public/whatsapp/interakt
 *   Secret: value of INTERAKT_WEBHOOK_SECRET (sent as X-Interakt-Signature: sha256=<hex>)
 *
 * If INTERAKT_WEBHOOK_SECRET is unset, requests are rejected to avoid silently
 * accepting unauthenticated traffic.
 */
export const Route = createFileRoute("/api/public/whatsapp/interakt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INTERAKT_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook secret not configured", { status: 503 });

        const body = await request.text();
        const sigHeader = request.headers.get("x-interakt-signature") ?? "";
        const provided = sigHeader.replace(/^sha256=/, "");
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const a = Buffer.from(provided, "hex");
        const b = Buffer.from(expected, "hex");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Interakt sends an array of events or a single event under various shapes.
        const events: any[] = Array.isArray(payload) ? payload : (payload?.events ?? [payload]);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        for (const ev of events) {
          const messageId: string | undefined =
            ev?.id ?? ev?.message_id ?? ev?.data?.message_id ?? ev?.message?.id;
          const eventType: string | undefined = ev?.type ?? ev?.event ?? ev?.status;
          if (!messageId || !eventType) continue;

          const lc = String(eventType).toLowerCase();
          const update: Record<string, any> = {};
          if (lc.includes("read")) {
            update.read_status = "read";
            update.read_at = new Date().toISOString();
          } else if (lc.includes("deliver")) {
            update.read_status = "delivered";
          } else if (lc.includes("fail") || lc.includes("undeliver") || lc.includes("reject")) {
            update.status = "failed";
            update.failure_reason = ev?.reason ?? ev?.error?.message ?? String(eventType);
          } else if (lc.includes("sent") || lc.includes("accept")) {
            update.read_status = "sent";
          }
          if (Object.keys(update).length === 0) continue;
          await supabaseAdmin
            .from("notification_log")
            .update(update as any)
            .eq("whatsapp_message_id", messageId);
        }

        return new Response("ok", { status: 200 });
      },
      // Optional verification handshake some providers do via GET
      GET: async () => new Response("ok"),
    },
  },
});
