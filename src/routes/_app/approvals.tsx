import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type UserStatus = Database["public"]["Enums"]["user_status"];

const ROLES: AppRole[] = ["admin", "sales", "production", "hr", "customer", "employee"];

export const Route = createFileRoute("/_app/approvals")({
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const qc = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // fetch roles for each
      const { data: rolesData } = await supabase.from("user_roles").select("user_id, role");
      const rolesByUser: Record<string, AppRole[]> = {};
      (rolesData ?? []).forEach((r) => {
        (rolesByUser[r.user_id] ??= []).push(r.role as AppRole);
      });
      return (data ?? []).map((u) => ({ ...u, roles: rolesByUser[u.id] ?? [] }));
    },
  });

  const setStatus = async (id: string, status: UserStatus) => {
    const { error } = await supabase
      .from("profiles")
      .update({ status, approved_at: status === "approved" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`User ${status}`);
    qc.invalidateQueries({ queryKey: ["all-profiles"] });
  };

  const assignRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) { toast.error(error.message); return; }
    toast.success("Role assigned");
    qc.invalidateQueries({ queryKey: ["all-profiles"] });
  };

  const removeRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["all-profiles"] });
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                ) : users?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users yet.</TableCell></TableRow>
                ) : users?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(u.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={u.status === "approved" ? "default" : u.status === "rejected" ? "destructive" : "secondary"}>
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
                            {r} ×
                          </button>
                        ))}
                        {u.roles.length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 items-center">
                        <Select onValueChange={(v) => assignRole(u.id, v as AppRole)}>
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue placeholder="+ Role" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.filter((r) => !u.roles.includes(r)).map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {u.status !== "approved" && (
                          <Button size="sm" onClick={() => setStatus(u.id, "approved")}>Approve</Button>
                        )}
                        {u.status !== "rejected" && (
                          <Button size="sm" variant="outline" onClick={() => setStatus(u.id, "rejected")}>Reject</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
