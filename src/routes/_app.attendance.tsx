import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/_app/attendance")({ component: AttendancePage });

interface Punch {
  id: string;
  employee_id: string | null;
  employee_code: string;
  punch_type: "in" | "out";
  punch_time: string;
  employee_name?: string;
}

function AttendancePage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [feed, setFeed] = useState<Punch[]>([]);

  const { data: employees } = useQuery({
    queryKey: ["emps-min"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id, full_name, employee_code").eq("is_active", true);
      return data ?? [];
    },
  });

  const empMap = new Map((employees ?? []).map((e) => [e.id, e.full_name] as const));
  const empByCode = new Map((employees ?? []).map((e) => [e.employee_code, e.full_name] as const));

  // initial feed
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
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("attendance_date", date);
      return data ?? [];
    },
  });

  const byEmp = new Map((register ?? []).map((r) => [r.employee_id, r] as const));

  return (
    <>
      <PageHeader title="Attendance" description="Live biometric feed and daily register." />
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
