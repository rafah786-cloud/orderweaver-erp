import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const S=z.object({id:z.string().uuid(),shift_start:z.string().regex(/^\d{2}:\d{2}$/),shift_end:z.string().regex(/^\d{2}:\d{2}$/),late_grace_minutes:z.number().int().min(0).max(240),half_day_hours:z.number().finite().min(0).max(24),late_deduction_pct:z.number().finite().min(0).max(100),half_day_deduction_pct:z.number().finite().min(0).max(100),working_days_per_month:z.number().finite().min(1).max(31)});
export const saveShiftSettings=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>S.parse(d)).handler(async({data,context})=>{
 const {data:roles}=await context.supabase.from("user_roles").select("role").eq("user_id",context.userId).eq("role","admin").maybeSingle();if(!roles)throw new Error("Admin only");
 const {data:company,error:ce}=await context.supabase.rpc("current_company_id");if(ce||!company)throw new Error("No active company selected");
 const {error}=await context.supabase.from("shift_settings").update({shift_start:data.shift_start,shift_end:data.shift_end,late_grace_minutes:data.late_grace_minutes,half_day_hours:data.half_day_hours,late_deduction_pct:data.late_deduction_pct,half_day_deduction_pct:data.half_day_deduction_pct,working_days_per_month:data.working_days_per_month}).eq("id",data.id).eq("company_id",company);if(error)throw new Error(error.message);return{ok:true};
});
