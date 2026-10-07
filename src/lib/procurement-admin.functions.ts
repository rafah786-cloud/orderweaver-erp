import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Line=z.object({raw_material_id:z.string().uuid(),quantity:z.number().finite().positive(),unit_price:z.number().finite().nonnegative()});
const S=z.object({bill_number:z.string().trim().min(1).max(100),supplier_id:z.string().uuid().nullable().optional(),bill_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),notes:z.string().trim().max(5000).nullable().optional(),cgst_amount:z.number().finite().nonnegative(),sgst_amount:z.number().finite().nonnegative(),igst_amount:z.number().finite().nonnegative(),lines:z.array(Line).min(1).max(200)});
export const createPurchaseBill=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(d=>S.parse(d)).handler(async({data,context})=>{
 const {data:roles}=await context.supabase.from("user_roles").select("role").eq("user_id",context.userId).in("role",["admin","production"]);
 if(!roles?.length) throw new Error("Insufficient permissions");
 const {data:company,error:ce}=await context.supabase.rpc("current_company_id"); if(ce||!company) throw new Error("No active company selected");
 if(data.supplier_id){const {data:s,error}=await context.supabase.from("suppliers").select("id").eq("id",data.supplier_id).eq("company_id",company).maybeSingle();if(error||!s)throw new Error("Supplier is outside the active company");}
 const ids=[...new Set(data.lines.map(x=>x.raw_material_id))];
 const {data:materials,error:me}=await context.supabase.from("raw_materials").select("id").in("id",ids).eq("company_id",company);
 if(me)throw new Error(me.message); if((materials??[]).length!==ids.length)throw new Error("One or more raw materials are outside the active company");
 const subtotal=data.lines.reduce((n,x)=>n+x.quantity*x.unit_price,0);
 const tax=data.cgst_amount+data.sgst_amount+data.igst_amount;
 const total=subtotal+tax;
 if(!(total>0))throw new Error("Purchase bill total must be greater than zero");
 const {data:bill,error}=await context.supabase.from("purchase_bills").insert({company_id:company,bill_number:data.bill_number,supplier_id:data.supplier_id??null,bill_date:data.bill_date,subtotal,tax_amount:tax,cgst_amount:data.cgst_amount,sgst_amount:data.sgst_amount,igst_amount:data.igst_amount,total_amount:total,notes:data.notes??null,created_by:context.userId}).select("id").single();
 if(error||!bill)throw new Error(error?.message??"Failed to create purchase bill");
 const {error:ie}=await context.supabase.from("purchase_bill_items").insert(data.lines.map(x=>({company_id:company,purchase_bill_id:bill.id,raw_material_id:x.raw_material_id,quantity:x.quantity,unit_price:x.unit_price})));
 if(ie){await context.supabase.from("purchase_bills").delete().eq("id",bill.id);throw new Error(ie.message);}
 return {id:bill.id as string};
});
