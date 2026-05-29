import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GenSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  employee_id: z.string().uuid().optional(),
});

export const generatePayslips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => GenSchema.parse(d))
  .handler(async ({ data, context }) => {
    // role check
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    const ok = (roles ?? []).some((r) => r.role === "admin" || r.role === "hr");
    if (!ok) throw new Error("Admin/HR only");

    const { data: shift } = await supabaseAdmin.from("shift_settings").select("*").limit(1).maybeSingle();
    const workingDays = shift?.working_days_per_month ?? 26;
    const halfPct = Number(shift?.half_day_deduction_pct ?? 50);
    const latePct = Number(shift?.late_deduction_pct ?? 0);

    const start = new Date(Date.UTC(data.year, data.month - 1, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(data.year, data.month, 1)).toISOString().slice(0, 10);

    let empQ = supabaseAdmin.from("employees").select("*").eq("is_active", true);
    if (data.employee_id) empQ = empQ.eq("id", data.employee_id);
    const { data: employees, error: eErr } = await empQ;
    if (eErr) throw new Error(eErr.message);

    const results: Array<{ employee_id: string; net_salary: number }> = [];
    for (const emp of employees ?? []) {
      const { data: att } = await supabaseAdmin
        .from("attendance")
        .select("status, is_half_day, is_late, hours_worked")
        .eq("employee_id", emp.id)
        .gte("attendance_date", start)
        .lt("attendance_date", end);

      const rows = att ?? [];
      const present = rows.filter((r) => r.status === "present").length;
      const halfDays = rows.filter((r) => r.is_half_day).length;
      const lateDays = rows.filter((r) => r.is_late).length;
      const absent = Math.max(0, workingDays - present);

      const ctc = Number(emp.basic_salary || 0) + Number(emp.da || 0) +
                  Number(emp.hra || 0) + Number(emp.other_allowances || 0);
      const gross = (present / workingDays) * ctc;
      const halfDayDeduction = ((ctc / workingDays) * halfDays) * (halfPct / 100);
      const lateDeduction = ((ctc / workingDays) * lateDays) * (latePct / 100);
      const statutory = Number(emp.pf_deduction || 0) + Number(emp.esi_deduction || 0);
      const totalDeductions = halfDayDeduction + lateDeduction + statutory;
      const net = Math.max(0, gross - totalDeductions);

      await supabaseAdmin.from("payslips").upsert({
        employee_id: emp.id,
        period_year: data.year,
        period_month: data.month,
        days_worked: present,
        days_absent: absent,
        ot_hours: 0,
        gross_salary: gross,
        deductions: totalDeductions,
        net_salary: net,
      }, { onConflict: "employee_id,period_year,period_month" } as never);

      results.push({ employee_id: emp.id, net_salary: net });
    }
    return { count: results.length, results };
  });
