import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PunchSchema = z.object({
  employee_code: z.string().min(1).max(64),
  punch_type: z.enum(["in", "out"]),
  punch_time: z.string().datetime(),
  device_id: z.string().min(1).max(64),
});

export const Route = createFileRoute("/api/public/biometric/punch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-device-key");
        if (!apiKey) return new Response("Missing key", { status: 401 });

        const body = await request.json();
        const parsed = PunchSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const { employee_code, punch_type, punch_time, device_id } = parsed.data;

        const { data: device } = await supabaseAdmin
          .from("device_settings")
          .select("id, api_key_hash, is_active")
          .eq("device_id", device_id)
          .maybeSingle();

        if (!device || !device.is_active)
          return new Response("Device not registered", { status: 401 });
        const ok = await bcrypt.compare(apiKey, device.api_key_hash);
        if (!ok) return new Response("Invalid key", { status: 401 });

        const { data: emp } = await supabaseAdmin
          .from("employees")
          .select("id")
          .eq("employee_code", employee_code)
          .maybeSingle();

        const { error: insErr } = await supabaseAdmin.from("punch_events").insert({
          employee_id: emp?.id ?? null,
          employee_code,
          device_id,
          punch_type,
          punch_time,
          raw_payload: body,
        });
        if (insErr) {
          console.error("[biometric/punch] insert failed", insErr);
          return new Response("Internal error", { status: 500 });
        }

        await supabaseAdmin
          .from("device_settings")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("device_id", device_id);

        return Response.json({ ok: true, employee_matched: !!emp });
      },
    },
  },
});
