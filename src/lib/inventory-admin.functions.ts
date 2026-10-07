import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertInventoryRole(db: any, userId: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId)
    .in("role", ["admin", "accountant", "production"]);
  if (!data?.length) throw new Error("Insufficient permissions");
}
const ItemSchema=z.object({
 name:z.string().trim().min(1).max(200), code:z.string().trim().max(100).nullable().optional(),
 unit:z.string().trim().min(1).max(30), hsn_code:z.string().trim().max(30).nullable().optional(),
 gst_rate:z.number().finite().min(0).max(100), valuation_method:z.enum(["weighted_avg","fifo","standard"]),
 reorder_level:z.number().finite().min(0), standard_cost:z.number().finite().min(0)
});
export const createStockItem=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(d=>ItemSchema.parse(d)).handler(async({data,context})=>{
  await assertInventoryRole(context.supabase,context.userId);
  const {data:companyId,error:ce}=await context.supabase.rpc("current_company_id");
  if(ce||!companyId) throw new Error("No active company selected");
  const {data:row,error}=await context.supabase.from("stock_items").insert({...data,valuation_method:data.valuation_method === "standard" ? "standard_cost" : data.valuation_method,company_id:companyId}).select("id").single();
  if(error||!row) throw new Error(error?.message??"Failed to create stock item");
  return row.id;
 });
const GodownSchema=z.object({name:z.string().trim().min(1).max(200),code:z.string().trim().max(100).nullable().optional(),address:z.string().trim().max(1000).nullable().optional()});
export const createGodown=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(d=>GodownSchema.parse(d)).handler(async({data,context})=>{
  await assertInventoryRole(context.supabase,context.userId);
  const {data:companyId,error:ce}=await context.supabase.rpc("current_company_id");
  if(ce||!companyId) throw new Error("No active company selected");
  const {data:row,error}=await context.supabase.from("godowns").insert({...data,company_id:companyId}).select("id").single();
  if(error||!row) throw new Error(error?.message??"Failed to create godown");
  return row.id;
 });