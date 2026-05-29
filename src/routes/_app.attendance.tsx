import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Download, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addManualPunch, deletePunchEvent, recalcAttendance, recalcAttendanceForDay,
} from "@/lib/attendance.functions";

export const Route = createFileRoute("/_app/attendance")({ component: AttendancePage });

interface Punch {
  id: string;
  employee_id: string | null;
  employee_code: string;
  punch_type: "in" | "out";
  punch_time: string;
}

function AttendancePage() {
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "hr"]);
  const qc = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [feed, setFeed] = useState<Punch[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editEmpId, setEditEmpId] = useState<string | null>(null);

  const addFn = useServerFn(addManualPunch);
  const delFn = useServerFn(deletePunchEvent);
  const recalcFn = useServerFn(recalcAttendance);
  const recalcDayFn = useServerFn(recalcAttendanceForDay);

  const { data: employees } = useQuery({
    queryKey: ["emps-min"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id, full_name, employee_code").eq("is_active", true);
      return data ?? [];
    },
  });

  const empMap = new Map((employees ?? []).map((e) => [e.id, e.full_name] as const));
  const empByCode = new Map((employees ?? []).map((e) => [e.employee_code, e.full_name] as const));

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("punch_events")
        .select("id, employee_id, employee_code, punch_type, punch_time")
        .order("punch_time", { ascending: false })
        .limit(10);
      setFeed((data ?? []) as Punch[]);
    })();

    const ch = supabase.channel("punch-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "punch_events" }, (payload) => {
        setFeed((prev) => [payload.new as Punch, ...prev].slice(0, 10));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const { data: register } = useQuery({
    queryKey: ["att-register", date],
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("*").eq("attendance_date", date);
      return data ?? [];
    },
  });

  const byEmp = new Map((register ?? []).map((r) => [r.employee_id, r] as const));

  const recalcDay = useMutation({
    mutationFn: () => recalcDayFn({ data: { date } }),
    onSuccess: () => {
      toast.success("Attendance recalculated for the day");
      qc.invalidateQueries({ queryKey: ["att-register"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Live biometric feed, daily register, and HR corrections."
        actions={canEdit ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => recalcDay.mutate()} disabled={recalcDay.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1 ${recalcDay.isPending ? "animate-spin" : ""}`} />
              Recalc Day
            </Button>
            <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" />Manual Punch</Button>
          </div>
        ) : undefined}
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Live Feed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {feed.length === 0 && <p className="text-sm text-muted-foreground">Waiting for punches…</p>}
              {feed.map((p) => {
                const name = (p.employee_id && empMap.get(p.employee_id)) || empByCode.get(p.employee_code) || p.employee_code;
                return (
                  <div key={p.id} className="flex items-center justify-between border-b last:border-b-0 py-2 text-sm">
                    <div>
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-muted-foreground">{new Date(p.punch_time).toLocaleString()}</div>
                    </div>
                    <Badge className={p.punch_type === "in" ? "bg-green-600 hover:bg-green-600" : "bg-red-600 hover:bg-red-600"}>
                      {p.punch_type.toUpperCase()}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Daily Register</CardTitle>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>In</TableHead>
                    <TableHead>Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(employees ?? []).map((e) => {
                    const r = byEmp.get(e.id);
                    return (
                      <TableRow key={e.id}>
                        <TableCell>{e.full_name}</TableCell>
                        <TableCell>{r?.first_in ? new Date(r.first_in).toLocaleTimeString() : "—"}</TableCell>
                        <TableCell>{r?.last_out ? new Date(r.last_out).toLocaleTimeString() : "—"}</TableCell>
                        <TableCell>{r?.hours_worked ? Number(r.hours_worked).toFixed(1) : "—"}</TableCell>
                        <TableCell className="space-x-1">
                          {!r ? <Badge variant="secondary">Absent</Badge> : (
                            <>
                              {r.is_half_day ? <Badge className="bg-amber-500 hover:bg-amber-500">Half Day</Badge> : <Badge>Present</Badge>}
                              {r.is_late && <Badge variant="outline" className="border-amber-500 text-amber-600">Late</Badge>}
                              {r.is_early_exit && <Badge variant="outline" className="border-red-500 text-red-600">Early Exit</Badge>}
                            </>
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button size="icon" variant="ghost" onClick={() => setEditEmpId(e.id)} title="Edit punches">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </PageBody>

      <ManualPunchDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        employees={employees ?? []}
        defaultDate={date}
        onSubmit={async (payload) => {
          await addFn({ data: payload });
          toast.success("Punch added");
          qc.invalidateQueries({ queryKey: ["att-register"] });
        }}
      />

      <EmployeePunchesDialog
        employeeId={editEmpId}
        date={date}
        employeeName={editEmpId ? empMap.get(editEmpId) : undefined}
        onClose={() => setEditEmpId(null)}
        onDelete={async (id) => {
          await delFn({ data: { id } });
          toast.success("Punch deleted");
          qc.invalidateQueries({ queryKey: ["att-register"] });
        }}
        onRecalc={async (employee_id) => {
          await recalcFn({ data: { employee_id, date } });
          toast.success("Attendance recalculated");
          qc.invalidateQueries({ queryKey: ["att-register"] });
        }}
        onAdd={async (payload) => {
          await addFn({ data: payload });
          toast.success("Punch added");
          qc.invalidateQueries({ queryKey: ["att-register"] });
        }}
      />
    </>
  );
}

function ManualPunchDialog({
  open, onOpenChange, employees, defaultDate, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: { id: string; full_name: string }[];
  defaultDate: string;
  onSubmit: (p: { employee_id: string; punch_type: "in" | "out"; punch_time: string; note?: string }) => Promise<void>;
}) {
  const [empId, setEmpId] = useState("");
  const [type, setType] = useState<"in" | "out">("in");
  const [dt, setDt] = useState(`${defaultDate}T09:00`);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setEmpId(""); setType("in"); setDt(`${defaultDate}T09:00`); setNote(""); } }, [open, defaultDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manual Punch</DialogTitle>
          <DialogDescription>Add an IN or OUT punch. Attendance recalculates automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Employee *</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "in" | "out")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">IN</SelectItem>
                  <SelectItem value="out">OUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Date & Time</Label>
              <Input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for manual entry" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={busy || !empId}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({ employee_id: empId, punch_type: type, punch_time: dt, note: note || undefined });
                onOpenChange(false);
              } catch (e) { toast.error((e as Error).message); }
              finally { setBusy(false); }
            }}
          >
            {busy ? "Saving…" : "Save Punch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeePunchesDialog({
  employeeId, employeeName, date, onClose, onDelete, onRecalc, onAdd,
}: {
  employeeId: string | null;
  employeeName?: string;
  date: string;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onRecalc: (employee_id: string) => Promise<void>;
  onAdd: (p: { employee_id: string; punch_type: "in" | "out"; punch_time: string; note?: string }) => Promise<void>;
}) {
  const [punches, setPunches] = useState<Punch[]>([]);
  const [loading, setLoading] = useState(false);
  const [addType, setAddType] = useState<"in" | "out">("in");
  const [addTime, setAddTime] = useState(`${date}T09:00`);

  const load = async () => {
    if (!employeeId) return;
    setLoading(true);
    const start = new Date(`${date}T00:00:00`).toISOString();
    const end = new Date(`${date}T23:59:59`).toISOString();
    const { data } = await supabase
      .from("punch_events")
      .select("id, employee_id, employee_code, punch_type, punch_time")
      .eq("employee_id", employeeId)
      .gte("punch_time", start)
      .lte("punch_time", end)
      .order("punch_time", { ascending: true });
    setPunches((data ?? []) as Punch[]);
    setLoading(false);
  };

  useEffect(() => { if (employeeId) { setAddTime(`${date}T09:00`); load(); } }, [employeeId, date]);

  return (
    <Dialog open={!!employeeId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Punches — {employeeName ?? ""}</DialogTitle>
          <DialogDescription>{new Date(date).toLocaleDateString()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : punches.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No punches recorded.</div>
            ) : (
              <div className="divide-y">
                {punches.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge className={p.punch_type === "in" ? "bg-green-600 hover:bg-green-600" : "bg-red-600 hover:bg-red-600"}>
                        {p.punch_type.toUpperCase()}
                      </Badge>
                      <span>{new Date(p.punch_time).toLocaleTimeString()}</span>
                    </div>
                    <Button
                      size="icon" variant="ghost"
                      onClick={async () => {
                        try { await onDelete(p.id); await load(); } catch (e) { toast.error((e as Error).message); }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <Label className="text-xs font-medium">Add punch</Label>
            <div className="flex gap-2">
              <Select value={addType} onValueChange={(v) => setAddType(v as "in" | "out")}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">IN</SelectItem>
                  <SelectItem value="out">OUT</SelectItem>
                </SelectContent>
              </Select>
              <Input type="datetime-local" value={addTime} onChange={(e) => setAddTime(e.target.value)} className="flex-1" />
              <Button
                onClick={async () => {
                  if (!employeeId) return;
                  try {
                    await onAdd({ employee_id: employeeId, punch_type: addType, punch_time: addTime });
                    await load();
                  } catch (e) { toast.error((e as Error).message); }
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={async () => {
              if (!employeeId) return;
              try { await onRecalc(employeeId); await load(); } catch (e) { toast.error((e as Error).message); }
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />Recalc
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
