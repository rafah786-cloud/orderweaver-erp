import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function maskEmail(email: string) {
  const [u, d] = email.split("@");
  if (!u || !d) return email;
  const head = u.slice(0, Math.min(2, u.length));
  return `${head}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
}

export const lookupEmailByNamePhone = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().min(4).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name, phone")
      .ilike("full_name", data.fullName)
      .eq("phone", data.phone)
      .limit(2);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      return { found: false as const };
    }
    if (rows.length > 1) {
      return { found: false as const, ambiguous: true };
    }
    return { found: true as const, maskedEmail: maskEmail(rows[0].email) };
  });
