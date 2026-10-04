import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "my_account",
  title: "My ERP account",
  description: "Read the signed-in person's approved ERP account name and assigned roles.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Sign in to view your account");
    const db = supabaseForUser(ctx);
    const [profile, roles] = await Promise.all([
      db.from("profiles").select("full_name, status").eq("id", ctx.getUserId()).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", ctx.getUserId()),
    ]);
    if (profile.error || roles.error) throw new ToolError("Could not read your ERP account");
    if (profile.data?.status !== "approved") throw new ToolError("Your ERP account is not approved");
    const account = { name: profile.data.full_name, roles: (roles.data ?? []).map(({ role }) => role) };
    return { content: [{ type: "text", text: JSON.stringify(account) }], structuredContent: { account } };
  },
});