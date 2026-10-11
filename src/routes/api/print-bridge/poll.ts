import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Body = z.object({ device_id: z.string().uuid() });

function unauthorized() { return Response.json({ error: "Unauthorized printer device" }, { status: 401 }); }

export const Route = createFileRoute("/api/print-bridge/poll")({
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
        if (deviceError) return Response.json({ error: "Printer queue is temporarily unavailable" }, { status: 503 });
        if (!device) return unauthorized();

        const { data: jobs, error } = await db.rpc("claim_production_print_job", {
          p_device_id: device.id, p_token_hash: tokenHash,
        });
        if (error) return Response.json({ error: "Printer queue is temporarily unavailable" }, { status: 503 });
        const job = Array.isArray(jobs) ? jobs[0] : null;
        return Response.json({ job: job ? { id: job.id, payload: job.payload } : null });
      },
    },
  },
});
