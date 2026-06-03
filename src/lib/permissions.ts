import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Single source of truth for which roles may VIEW each top-level screen.
 * Used by both the sidebar (to filter nav) and the route guard in _app.tsx
 * (to block direct URL navigation).
 *
 * Mutation-level checks (create/edit/delete) remain enforced inside each
 * page via `hasAnyRole(...)` and by Supabase RLS as the backstop.
 */
export const ROUTE_ROLES: { prefix: string; roles: AppRole[] }[] = [
  { prefix: "/dashboard",    roles: ["admin", "sales", "production", "hr", "customer", "employee"] },
  { prefix: "/parties",      roles: ["admin", "sales"] },
  { prefix: "/invoices",     roles: ["admin", "sales", "customer"] },
  { prefix: "/sales-orders", roles: ["admin", "sales", "customer"] },
  { prefix: "/boq",          roles: ["admin", "sales", "production"] },
  { prefix: "/purchases",    roles: ["admin", "production"] },
  { prefix: "/production",   roles: ["admin", "production", "sales"] },
  { prefix: "/employees",    roles: ["admin", "hr"] },
  { prefix: "/attendance",   roles: ["admin", "hr", "employee"] },
  { prefix: "/payslips",     roles: ["admin", "hr", "employee"] },
  { prefix: "/approvals",    roles: ["admin"] },
  { prefix: "/whatsapp",     roles: ["admin", "sales", "production", "hr", "customer", "employee"] },
  { prefix: "/tally-import", roles: ["admin"] },
  { prefix: "/accounting",   roles: ["admin", "accountant"] },
  { prefix: "/gst",          roles: ["admin", "accountant"] },
  { prefix: "/inventory",    roles: ["admin", "accountant", "production", "sales"] },
  { prefix: "/print",        roles: ["admin", "sales", "production", "customer"] },
  { prefix: "/settings",     roles: ["admin"] },
];

export function allowedRolesFor(pathname: string): AppRole[] | null {
  const match = ROUTE_ROLES.find((r) => pathname.startsWith(r.prefix));
  return match ? match.roles : null;
}
