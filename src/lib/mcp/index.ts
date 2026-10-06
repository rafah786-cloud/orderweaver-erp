import { auth, defineMcp } from "@lovable.dev/mcp-js";
import myAccount from "./tools/my-account";
import recentInvoices from "./tools/recent-invoices";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "mattress-maestro-erp",
  title: "Mattress Maestro ERP",
  version: "0.1.0",
  instructions:
    "Read-only Mattress Maestro ERP tools. Sign in with your ERP account; invoice data requires an approved sales or accounting role.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [myAccount, recentInvoices],
});
