import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Body = z.object({
  device_id: z.string().uuid(),
  job_id: z.string().uuid(),
  outcome: z.enum(["spooled", "failed", "needs_review"]),
  message: z.string().max(1000).optional(),
});

function unauthorized() { return Response.json({ error: "Unauthorized printer device" }, { status: 401 }); }

export const Route = createFileRoute("/api/print-bridge/ack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!/^[0-9a-f]{64}$/i.test(token)) return unauthorized();

        const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
        const db: any = supabaseAdmin;
        const { data: device, error: deviceError } = await db.from("production_print_devices")
          .select("id,company_id,is_active")
          .eq("id", parsed.data.device_id).eq("token_hash", tokenHash).eq("is_active", true).maybeSingle();
        if (deviceError) return Response.json({ error: "Print status is temporarily unavailable" }, { status: 503 });
        if (!device) return unauthorized();

        const now = new Date().toISOString();
        const needsError = parsed.data.outcome !== "spooled";
        const { data: updated, error } = await db.from("production_print_jobs")
          .update({
            status: parsed.data.outcome,
            completed_at: now,
            updated_at: now,
            last_error: needsError ? (parsed.data.message || parsed.data.outcome).slice(0, 1000) : null,
          })
          .eq("id", parsed.data.job_id)
          .eq("company_id", device.company_id)
          .eq("device_id", device.id)
          .eq("status", "claimed")
          .select("id")
          .maybeSingle();

        if (error) return Response.json({ error: "Print status is temporarily unavailable" }, { status: 503 });
        if (!updated) return Response.json({ error: "Job is not claimed by this device or has already been acknowledged" }, { status: 409 });
        return Response.json({ ok: true, job_id: updated.id, outcome: parsed.data.outcome });
      },
    },
  },
});
