import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { setUserStatus, assignUserRole, removeUserRole, setUserCompanyAccess } from "@/lib/approvals.functions";

type AppRole = Database["public"]["Enums"]["app_role"];
type UserStatus = Database["public"]["Enums"]["user_status"];

// Display order + friendly labels for the 8 assignable roles.
const ROLES: { value: AppRole; label: string }[] = [
  { value: "admin", label: "Admin/Management" },
  { value: "accountant", label: "Accounts" },
  { value: "sales", label: "Sales" },
  { value: "production", label: "Production" },
  { value: "customer", label: "Customers" },
  { value: "vendor", label: "Vendors" },
  { value: "hr", label: "HR" },
  { value: "employee", label: "Employee" },
];
const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLES.map((r) => [r.value, r.label]),
);
function roleLabel(r: AppRole) {
  return ROLE_LABELS[r] ?? r;
}

export const Route = createFileRoute("/_app/approvals")({
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const qc = useQueryClient();
  const setStatusFn = useServerFn(setUserStatus);
  const assignRoleFn = useServerFn(assignUserRole);
  const removeRoleFn = useServerFn(removeUserRole);
  const setCompanyAccessFn = useServerFn(setUserCompanyAccess);
  const [companyDrafts, setCompanyDrafts] = useState<Record<string, string[]>>({});

  const { data: users, isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const [{ data: rolesData }, { data: memberships }, { data: companiesData }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("user_company_access").select("user_id, company_id, can_view"),
        supabase.from("companies").select("id, code, display_name").eq("is_active", true).order("display_name"),
      ]);
      const rolesByUser: Record<string, AppRole[]> = {};
      (rolesData ?? []).forEach((r) => { (rolesByUser[r.user_id] ??= []).push(r.role as AppRole); });
      const companies = (companiesData ?? []) as { id: string; code: string; display_name: string }[];
      const companiesByUser: Record<string, string[]> = {};
      (memberships ?? []).forEach((m) => {
        if (m.can_view) (companiesByUser[m.user_id] ??= []).push(m.company_id);
      });
      return (data ?? []).map((u) => ({
        ...u,
        roles: rolesByUser[u.id] ?? [],
        company_ids: companiesByUser[u.id] ?? [],
        companies,
      }));
    },
  });

  const setStatus = async (id: string, status: UserStatus) => {
    try {
      await setStatusFn({ data: { user_id: id, status } });
      toast.success(`User ${status}`);
      qc.invalidateQueries({ queryKey: ["all-profiles"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const assignRole = async (userId: string, role: AppRole) => {
    try {
      await assignRoleFn({ data: { user_id: userId, role } });
      toast.success("Role assigned");
      qc.invalidateQueries({ queryKey: ["all-profiles"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const removeRole = async (userId: string, role: AppRole) => {
    try {
      await removeRoleFn({ data: { user_id: userId, role } });
      qc.invalidateQueries({ queryKey: ["all-profiles"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleCompany = (userId: string, companyId: string, current: string[]) => {
    const next = current.includes(companyId)
      ? current.filter((id) => id !== companyId)
      : [...current, companyId];
    setCompanyDrafts((d) => ({ ...d, [userId]: next }));
  };

  const saveCompanyAccess = async (userId: string, fallback: string[]) => {
    try {
      const ids = companyDrafts[userId] ?? fallback;
      await setCompanyAccessFn({ data: { user_id: userId, company_ids: ids } });
      setCompanyDrafts((d) => {
        const next = { ...d };
        delete next[userId];
        return next;
      });
      toast.success("Company access updated");
      qc.invalidateQueries({ queryKey: ["all-profiles"] });
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  };

  return (
    <>
      <PageHeader title="User Approvals" description="Approve new users and assign roles." />
      <PageBody>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Company access</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : users?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No users yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  users?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(u.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            u.status === "approved"
                              ? "default"
                              : u.status === "rejected"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <button
                              key={r}
                              onClick={() => removeRole(u.id, r)}
                              className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground"
                              title="Click to remove"
                            >
                              {roleLabel(r)} ×
                            </button>
                          ))}
                          {u.roles.length === 0 && (
                            <span className="text-xs text-muted-foreground">No roles</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const selected = companyDrafts[u.id] ?? u.company_ids;
                          return (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 min-w-40 justify-between text-xs">
                                  Companies ({selected.length}/4)
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-72">
                                <div className="space-y-2">
                                  <div className="text-xs font-medium">Grant access</div>
                                  {u.companies.map((company: { id: string; code: string; display_name: string }) => (
                                    <label key={company.id} className="flex items-start gap-2 rounded-md p-2 hover:bg-muted cursor-pointer">
                                      <Checkbox
                                        checked={selected.includes(company.id)}
                                        disabled={company.code === "ABOOD"}
                                        onCheckedChange={() => toggleCompany(u.id, company.id, selected)}
                                      />
                                      <span className="leading-tight">
                                        <span className="block text-sm">{company.display_name}</span>
                                        <span className="text-[10px] text-muted-foreground">{company.code}</span>
                                      </span>
                                    </label>
                                  ))}
                                  <p className="text-[10px] text-muted-foreground pt-1">ABOOD TRADINGS is always retained as the default company.</p>
                                  <Button size="sm" className="w-full" onClick={() => void saveCompanyAccess(u.id, u.company_ids)}>
                                    Save access
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 items-center">
                          <Select onValueChange={(v) => assignRole(u.id, v as AppRole)}>
                            <SelectTrigger className="w-40 h-8 text-xs">
                              <SelectValue placeholder="+ Role" />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.filter((r) => !u.roles.includes(r.value)).map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {u.status !== "approved" && (
                            <Button size="sm" onClick={async () => { await saveCompanyAccess(u.id, u.company_ids); await setStatus(u.id, "approved"); }}>
                              Approve
                            </Button>
                          )}
                          {u.status !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setStatus(u.id, "rejected")}
                            >
                              Reject
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
