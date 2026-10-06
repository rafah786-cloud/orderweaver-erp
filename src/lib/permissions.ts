import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Single source of truth for which roles may VIEW each top-level screen.
 * Mutation-level checks and Supabase RLS remain the enforcement backstop.
 */
export const ROUTE_ROLES: { prefix: string; roles: AppRole[] }[] = [
  {
    prefix: "/dashboard",
    roles: ["admin", "accountant", "sales", "production", "hr", "customer", "employee"],
  },
  { prefix: "/parties", roles: ["admin", "sales"] },
  { prefix: "/invoices", roles: ["admin", "sales", "accountant", "customer"] },
  { prefix: "/sales-orders", roles: ["admin", "sales", "customer"] },
  { prefix: "/boq", roles: ["admin", "sales", "production"] },
  { prefix: "/purchases", roles: ["admin", "accountant", "production"] },
  { prefix: "/production", roles: ["admin", "production", "sales"] },
  { prefix: "/employees", roles: ["admin", "hr"] },
  { prefix: "/attendance", roles: ["admin", "hr", "employee"] },
  { prefix: "/payslips", roles: ["admin", "hr", "employee"] },
  { prefix: "/approvals", roles: ["admin"] },
  {
    prefix: "/whatsapp",
    roles: ["admin", "accountant", "sales", "production", "hr", "employee", "customer", "vendor"],
  },
  { prefix: "/communications", roles: ["admin"] },
  { prefix: "/tally-import", roles: ["admin"] },
  { prefix: "/accounting", roles: ["admin", "accountant"] },
  { prefix: "/gst", roles: ["admin", "accountant"] },
  { prefix: "/inventory", roles: ["admin", "accountant", "production", "sales"] },
  { prefix: "/banking", roles: ["admin", "accountant"] },
  { prefix: "/ai", roles: ["admin", "accountant", "sales", "production"] },
  { prefix: "/print", roles: ["admin", "sales", "production", "accountant", "customer", "vendor"] },
  { prefix: "/vendor", roles: ["admin", "vendor"] },
  { prefix: "/settings", roles: ["admin"] },
];

const DEFAULT_ROUTE_BY_ROLE: Partial<Record<AppRole, string>> = {
  admin: "/dashboard",
  accountant: "/accounting",
  sales: "/dashboard",
  production: "/production",
  hr: "/employees",
  employee: "/attendance",
  customer: "/dashboard",
  vendor: "/vendor",
};

export function defaultRouteForRoles(roles: AppRole[]): string {
  for (const role of [
    "admin",
    "accountant",
    "sales",
    "production",
    "hr",
    "employee",
    "customer",
    "vendor",
  ] as AppRole[]) {
    if (roles.includes(role)) return DEFAULT_ROUTE_BY_ROLE[role] ?? "/dashboard";
  }
  return "/pending";
}

export function allowedRolesFor(pathname: string): AppRole[] | null {
  const match = ROUTE_ROLES.find((r) => pathname.startsWith(r.prefix));
  return match ? match.roles : null;
}
