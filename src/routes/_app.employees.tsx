import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveEmployee } from "@/lib/employees-admin.functions";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { inr, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesPage,
});

type EmployeeRow = {
  id: string;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  date_of_joining: string | null;
  pay_type: string;
  basic_salary: number;
  da: number;
  hra: number;
  other_allowances: number;
  daily_wage: number;
  ot_rate_per_hour: number;
  pf_deduction: number;
  esi_deduction: number;
  is_active: boolean;
};

const empty: Omit<EmployeeRow, "id"> = {
  employee_code: "",
  full_name: "",
  email: "",
  phone: "",
  department: "",
  designation: "",
  date_of_joining: "",
  pay_type: "monthly",
  basic_salary: 0,
  da: 0,
  hra: 0,
  other_allowances: 0,
  daily_wage: 0,
  ot_rate_per_hour: 0,
  pf_deduction: 0,
  esi_deduction: 0,
  is_active: true,
};

function EmployeesPage() {
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "hr"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [form, setForm] = useState<Omit<EmployeeRow, "id">>(empty);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees", showInactive],
    queryFn: async () => {
      let q = supabase
        .from("employees")
        .select(
          "id, employee_code, full_name, email, phone, department, designation, date_of_joining, pay_type, basic_salary, da, hra, other_allowances, daily_wage, ot_rate_per_hour, pf_deduction, esi_deduction, is_active",
        )
        .order("employee_code");
      if (!showInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EmployeeRow[];
    },
  });

  const filtered = employees.filter((e) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      e.full_name.toLowerCase().includes(s) ||
      e.employee_code.toLowerCase().includes(s) ||
      (e.department ?? "").toLowerCase().includes(s) ||
      (e.designation ?? "").toLowerCase().includes(s)
    );
  });

  const grossMonthly = (
    e: Pick<
      EmployeeRow,
      "pay_type" | "basic_salary" | "da" | "hra" | "other_allowances" | "daily_wage"
    >,
  ) => {
    if (e.pay_type === "daily") return Number(e.daily_wage) * 26;
    return Number(e.basic_salary) + Number(e.da) + Number(e.hra) + Number(e.other_allowances);
  };

  const saveEmployeeFn = useServerFn(saveEmployee);
  const save = useMutation({
    mutationFn: async () => {
      if (!form.employee_code.trim()) throw new Error("Employee code is required");
      if (!form.full_name.trim()) throw new Error("Full name is required");
      return saveEmployeeFn({
        data: {
          id: editing?.id,
          employee_code: form.employee_code.trim(),
          full_name: form.full_name.trim(),
          email: form.email || null,
          phone: form.phone || null,
          department: form.department || null,
          designation: form.designation || null,
          date_of_joining: form.date_of_joining || null,
          pay_type: form.pay_type,
          basic_salary: Number(form.basic_salary) || 0,
          da: Number(form.da) || 0,
          hra: Number(form.hra) || 0,
          other_allowances: Number(form.other_allowances) || 0,
          daily_wage: Number(form.daily_wage) || 0,
          ot_rate_per_hour: Number(form.ot_rate_per_hour) || 0,
          pf_deduction: Number(form.pf_deduction) || 0,
          esi_deduction: Number(form.esi_deduction) || 0,
          is_active: form.is_active,
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Employee updated" : "Employee added");
      qc.invalidateQueries({ queryKey: ["employees"] });
      setOpen(false);
      setEditing(null);
      setForm(empty);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };
  const openEdit = (e: EmployeeRow) => {
    setEditing(e);
    setForm({
      employee_code: e.employee_code,
      full_name: e.full_name,
      email: e.email ?? "",
      phone: e.phone ?? "",
      department: e.department ?? "",
      designation: e.designation ?? "",
      date_of_joining: e.date_of_joining ?? "",
      pay_type: e.pay_type,
      basic_salary: e.basic_salary,
      da: e.da,
      hra: e.hra,
      other_allowances: e.other_allowances,
      daily_wage: e.daily_wage,
      ot_rate_per_hour: e.ot_rate_per_hour,
      pf_deduction: e.pf_deduction,
      esi_deduction: e.esi_deduction,
      is_active: e.is_active,
    });
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Employees"
        description="Employee master with configurable pay structures."
        actions={
          canEdit ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              New Employee
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, code, department…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant={showInactive ? "default" : "outline"}
                size="sm"
                onClick={() => setShowInactive((v) => !v)}
              >
                {showInactive ? "Showing inactive" : "Show inactive"}
              </Button>
              <div className="text-sm text-muted-foreground ml-auto">
                {filtered.length} of {employees.length} employees
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Pay Type</TableHead>
                    <TableHead className="text-right">Gross Monthly</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                        No employees found. {canEdit && "Click New Employee to add one."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-sm">{e.employee_code}</TableCell>
                        <TableCell className="font-medium">{e.full_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {e.department ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {e.designation ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(e.date_of_joining)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {e.pay_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {inr(grossMonthly(e))}
                        </TableCell>
                        <TableCell>
                          {e.is_active ? (
                            <Badge variant="secondary">Active</Badge>
                          ) : (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button size="icon" variant="ghost" onClick={() => openEdit(e)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Employee" : "New Employee"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Basic Info</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Employee Code *">
                  <Input
                    value={form.employee_code}
                    onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
                    placeholder="EMP001"
                  />
                </Field>
                <Field label="Full Name *">
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={form.email ?? ""}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={form.phone ?? ""}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
                <Field label="Department">
                  <Input
                    value={form.department ?? ""}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  />
                </Field>
                <Field label="Designation">
                  <Input
                    value={form.designation ?? ""}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  />
                </Field>
                <Field label="Date of Joining">
                  <Input
                    type="date"
                    value={form.date_of_joining ?? ""}
                    onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })}
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={form.is_active ? "active" : "inactive"}
                    onValueChange={(v) => setForm({ ...form, is_active: v === "active" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>

            <section className="grid gap-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Pay Structure</h3>
              <Field label="Pay Type">
                <Select
                  value={form.pay_type}
                  onValueChange={(v) => setForm({ ...form, pay_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly (Basic + DA + HRA + Others)</SelectItem>
                    <SelectItem value="daily">Daily Wage</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {form.pay_type === "monthly" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Basic Salary (₹)">
                    <Input
                      type="number"
                      value={form.basic_salary}
                      onChange={(e) => setForm({ ...form, basic_salary: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="DA (₹)">
                    <Input
                      type="number"
                      value={form.da}
                      onChange={(e) => setForm({ ...form, da: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="HRA (₹)">
                    <Input
                      type="number"
                      value={form.hra}
                      onChange={(e) => setForm({ ...form, hra: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Other Allowances (₹)">
                    <Input
                      type="number"
                      value={form.other_allowances}
                      onChange={(e) =>
                        setForm({ ...form, other_allowances: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
              ) : (
                <Field label="Daily Wage (₹)">
                  <Input
                    type="number"
                    value={form.daily_wage}
                    onChange={(e) => setForm({ ...form, daily_wage: Number(e.target.value) })}
                  />
                </Field>
              )}

              <div className="grid grid-cols-3 gap-3">
                <Field label="OT Rate / Hour (₹)">
                  <Input
                    type="number"
                    value={form.ot_rate_per_hour}
                    onChange={(e) => setForm({ ...form, ot_rate_per_hour: Number(e.target.value) })}
                  />
                </Field>
                <Field label="PF Deduction (₹)">
                  <Input
                    type="number"
                    value={form.pf_deduction}
                    onChange={(e) => setForm({ ...form, pf_deduction: Number(e.target.value) })}
                  />
                </Field>
                <Field label="ESI Deduction (₹)">
                  <Input
                    type="number"
                    value={form.esi_deduction}
                    onChange={(e) => setForm({ ...form, esi_deduction: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Estimated Gross Monthly: </span>
                <span className="font-semibold">{inr(grossMonthly(form))}</span>
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
