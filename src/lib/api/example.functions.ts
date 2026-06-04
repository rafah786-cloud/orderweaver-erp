import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Example createServerFn. Authenticated-only and does not leak any server
// configuration. Kept as a minimal authenticated RPC demo.
export const getGreeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().min(1).max(120) }))
  .handler(async ({ data }) => {
    return { greeting: `Hello, ${data.name}!` };
  });
