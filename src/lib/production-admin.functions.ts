import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const S=z.object({id:z.string().uuid(),status:z.enum(["received","in_production","qc","ready","dispatched"]),tracking_number:z.string().trim().max(200).nullable(),transporter_name:z.string().trim().max(200).nullable()});
export const advanceProductionOrder=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>S.parse(d)).handler(async({data,context})=>{
 const {data:roles}=await context.supabase.from("user_roles").select("role").eq("user_id",context.userId).in("role",["admin","production"]);
 if(!roles?.length) throw new Error("Insufficient permissions");
 const {data:row,error}=await context.supabase.from("production_orders").select("id,status,sales_order_id").eq("id",data.id).maybeSingle();
 if(error||!row) throw new Error(error?.message??"Production order not found");
 const next:{received:string,in_production:string,qc:string,ready:string,dispatched:string|null}={received:"in_production",in_production:"qc",qc:"ready",ready:"dispatched",dispatched:null};
 if(next[row.status as keyof typeof next]!==data.status) throw new Error("Invalid production status transition");
 const stamp:Record<string,string>={in_production:"started_at",qc:"qc_at",ready:"ready_at",dispatched:"dispatched_at"};
 const patch:any={status:data.status,...(stamp[data.status]?{[stamp[data.status]]:new Date().toISOString()}:{}),tracking_number:data.tracking_number,transporter_name:data.transporter_name};
 const {error:ue}=await context.supabase.from("production_orders").update(patch).eq("id",data.id);
 if(ue) throw new Error(ue.message);
 return {ok:true};
});