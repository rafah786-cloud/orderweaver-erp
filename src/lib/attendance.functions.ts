import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertHrOrAdmin(db: any, userId: string) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "hr"]);
  if (error || !data || data.length === 0) throw new Error("Admin or HR only");
}

async function getActiveCompanyId(db: any): Promise<string> {
  const { data, error } = await db.rpc("current_company_id");
  if (error || !data) throw new Error("No active company selected");
  return data;
}

function fail(tag: string, err: unknown, userMsg: string): never {
  console.error(`[attendance] ${tag}`, err);
  throw new Error(userMsg);
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
    await assertHrOrAdmin(context.supabase, context.userId);
    const companyId = await getActiveCompanyId(context.supabase);
    const { data: emp, error: empErr } = await supabaseAdmin
      .from("employees")
      .select("employee_code, company_id")
      .eq("id", data.employee_id)
      .eq("company_id", companyId)
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
    if (error) fail("addManualPunch insert", error, "Failed to record punch. Please try again.");
    return { ok: true };
  });

export const deletePunchEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHrOrAdmin(context.supabase, context.userId);
    const companyId = await getActiveCompanyId(context.supabase);
    const { data: row } = await supabaseAdmin
      .from("punch_events")
      .select("employee_id, punch_time, employees!inner(company_id)")
      .eq("id", data.id)
      .eq("employees.company_id", companyId)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("punch_events").delete().eq("id", data.id);
    if (error) fail("deletePunchEvent", error, "Failed to delete punch. Please try again.");
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
    await assertHrOrAdmin(context.supabase, context.userId);
    const companyId = await getActiveCompanyId(context.supabase);
    const { data: emp } = await supabaseAdmin
      .from("employees").select("id").eq("id", data.employee_id).eq("company_id", companyId).maybeSingle();
    if (!emp) throw new Error("Employee not found in the active company");
    const { error } = await supabaseAdmin.rpc("recalc_attendance_day", {
      _employee_id: data.employee_id,
      _date: data.date,
    });
    if (error)
      fail("recalcAttendance", error, "Failed to recalculate attendance. Please try again.");
    return { ok: true };
  });

export const recalcAttendanceForDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ date: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHrOrAdmin(context.supabase, context.userId);
    const companyId = await getActiveCompanyId(context.supabase);
    const { data: emps } = await supabaseAdmin.from("employees").select("id").eq("company_id", companyId).eq("is_active", true);
    for (const e of emps ?? []) {
      await supabaseAdmin.rpc("recalc_attendance_day", { _employee_id: e.id, _date: data.date });
    }
    return { ok: true, count: emps?.length ?? 0 };
  });
