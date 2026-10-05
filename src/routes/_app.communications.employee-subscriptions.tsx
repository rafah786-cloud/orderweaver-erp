import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listSubscriptions,
  setSubscription,
  departmentEmployeeCounts,
  DEPARTMENTS,
  STAFF_EVENTS,
  STAFF_EVENT_LABEL,
} from "@/lib/staff-notifications.functions";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useMemo } from "react";

export const Route = createFileRoute("/_app/communications/employee-subscriptions")({
  component: EmployeeSubscriptionsPage,
});

function EmployeeSubscriptionsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSubscriptions);
  const setFn = useServerFn(setSubscription);
  const countsFn = useServerFn(departmentEmployeeCounts);

  const subsQ = useQuery({ queryKey: ["staff_subs"], queryFn: () => listFn() });
  const countsQ = useQuery({ queryKey: ["dept_emp_counts"], queryFn: () => countsFn() });

  const isOn = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const s of subsQ.data ?? []) {
      map.set(`${s.department}::${s.event_key}`, s.is_active);
    }
    return map;
  }, [subsQ.data]);

  const toggle = useMutation({
    mutationFn: (vars: {
      department: (typeof DEPARTMENTS)[number];
      event_key: (typeof STAFF_EVENTS)[number];
      is_active: boolean;
    }) => setFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff_subs"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  return (
    <>
      <PageHeader
        title="Employee Notifications"
        description="Route ERP events to departments. Employees in subscribed departments receive WhatsApp messages automatically. Logs are stored in Communications → WhatsApp Logs."
      />
      <PageBody>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Departments</CardTitle>
            <CardDescription>
              Active employees in each department. "With phone" counts those reachable on WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {DEPARTMENTS.map((d) => {
              const c = countsQ.data?.[d] ?? { total: 0, with_phone: 0 };
              return (
                <div key={d} className="rounded-md border p-3">
                  <div className="text-sm font-medium">{d}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.total} active · {c.with_phone} with phone
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trigger subscriptions</CardTitle>
            <CardDescription>
              Toggle which department gets notified for each ERP event.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[280px]">Event</TableHead>
                  {DEPARTMENTS.map((d) => (
                    <TableHead key={d} className="text-center">
                      {d}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {STAFF_EVENTS.map((evt) => (
                  <TableRow key={evt}>
                    <TableCell>
                      <div className="font-medium">{STAFF_EVENT_LABEL[evt]}</div>
                      <div className="text-xs text-muted-foreground">
                        <Badge variant="outline">{evt}</Badge>
                      </div>
                    </TableCell>
                    {DEPARTMENTS.map((d) => {
                      const on = isOn.get(`${d}::${evt}`) ?? false;
                      return (
                        <TableCell key={d} className="text-center">
                          <Switch
                            checked={on}
                            onCheckedChange={(v) =>
                              toggle.mutate({ department: d, event_key: evt, is_active: v })
                            }
                            disabled={toggle.isPending}
                          />
                        </TableCell>
                      );
                    })}
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
