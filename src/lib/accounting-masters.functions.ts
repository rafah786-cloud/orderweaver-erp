import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdminAccountant(db:any,userId:string){
 const {data}=await db.from("user_roles").select("role").eq("user_id",userId).in("role",["admin","accountant"]);
 if(!data?.length) throw new Error("Insufficient permissions");
}
export const createFinancialYear=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(d=>z.object({name:z.string().trim().min(1).max(50),start_date:z.string().date(),end_date:z.string().date()}).parse(d))
 .handler(async({data,context})=>{
  await assertAdminAccountant(context.supabase,context.userId);
  const {data:companyId,error:ce}=await context.supabase.rpc("current_company_id");
  if(ce||!companyId) throw new Error("No active company selected");
  const {data:row,error}=await context.supabase.from("financial_years").insert({...data,company_id:companyId}).select("id").single();
  if(error||!row) throw new Error(error?.message??"Failed to create financial year");
  return row.id;
 });
export const setFinancialYearLock=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(d=>z.object({id:z.string().uuid(),is_locked:z.boolean()}).parse(d))
 .handler(async({data,context})=>{
  await assertAdminAccountant(context.supabase,context.userId);
  const {error}=await context.supabase.from("financial_years").update({is_locked:data.is_locked}).eq("id",data.id);
  if(error) throw new Error(error.message); return {ok:true};
 });
export const createHsnCode=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(d=>z.object({code:z.string().trim().min(1).max(30),description:z.string().trim().min(1).max(500),type:z.enum(["HSN","SAC"]),default_tax_rate:z.number().finite().min(0).max(100)}).parse(d))
 .handler(async({data,context})=>{
  await assertAdminAccountant(context.supabase,context.userId);
  const {data:companyId,error:ce}=await context.supabase.rpc("current_company_id");
  if(ce||!companyId) throw new Error("No active company selected");
  const {data:row,error}=await context.supabase.from("hsn_codes").insert(data).select("id").single();
  if(error||!row) throw new Error(error?.message??"Failed to create HSN/SAC code");
  return row.id;
 });
export const deleteHsnCode=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(d=>z.object({id:z.string().uuid()}).parse(d))
 .handler(async({data,context})=>{
  await assertAdminAccountant(context.supabase,context.userId);
  const {error}=await context.supabase.from("hsn_codes").delete().eq("id",data.id);
  if(error) throw new Error(error.message); return {ok:true};
 });