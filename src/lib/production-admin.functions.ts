import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const S = z.object({
  id: z.string().uuid(),
  status: z.enum(["received", "in_production", "qc", "ready", "dispatched"]),
  tracking_number: z.string().trim().max(200).nullable(),
  transporter_name: z.string().trim().max(200).nullable(),
});

export const advanceProductionOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => S.parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc(
      "advance_production_order_atomic" as never,
      {
        p_order: data.id,
        p_status: data.status,
        p_tracking_number: data.tracking_number,
        p_transporter_name: data.transporter_name,
      } as never,
    );

    if (error) throw new Error(error.message);
    if (!id) throw new Error("Production transition returned no order");

    return { ok: true };
  });
