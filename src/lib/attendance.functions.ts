import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertHrOrAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "hr"]);
  if (!data || data.length === 0) throw new Error("Admin or HR only");
}

const PunchSchema = z.object({
  employee_id: z.string().uuid(),
  punch_type: z.enum(["in", "out"]),
  punch_time: z.string().min(10),
  note: z.string().max(200).optional(),
});

export const addManualPunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PunchSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHrOrAdmin(context.userId);
    const { data: emp, error: empErr } = await supabaseAdmin
      .from("employees")
      .select("employee_code")
      .eq("id", data.employee_id)
      .maybeSingle();
    if (empErr || !emp) throw new Error("Employee not found");

    const { error } = await supabaseAdmin.from("punch_events").insert({
      employee_id: data.employee_id,
      employee_code: emp.employee_code,
      punch_type: data.punch_type,
      punch_time: new Date(data.punch_time).toISOString(),
      device_id: "manual",
      raw_payload: { source: "manual", by: context.userId, note: data.note ?? null },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePunchEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHrOrAdmin(context.userId);
    // Find the punch to know which (employee, date) to recalc
    const { data: row } = await supabaseAdmin
      .from("punch_events")
      .select("employee_id, punch_time")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("punch_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row?.employee_id) {
      const d = new Date(row.punch_time).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      await supabaseAdmin.rpc("recalc_attendance_day", { _employee_id: row.employee_id, _date: d });
    }
    return { ok: true };
  });

export const recalcAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ employee_id: z.string().uuid(), date: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHrOrAdmin(context.userId);
    const { error } = await supabaseAdmin.rpc("recalc_attendance_day", {
      _employee_id: data.employee_id,
      _date: data.date,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recalcAttendanceForDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ date: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHrOrAdmin(context.userId);
    const { data: emps } = await supabaseAdmin.from("employees").select("id").eq("is_active", true);
    for (const e of emps ?? []) {
      await supabaseAdmin.rpc("recalc_attendance_day", { _employee_id: e.id, _date: data.date });
    }
    return { ok: true, count: emps?.length ?? 0 };
  });
