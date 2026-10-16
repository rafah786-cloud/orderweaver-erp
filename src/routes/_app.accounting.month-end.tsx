import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  createMonthEndChecklist,
  setCloseTaskStatus,
  type CloseTaskStatus,
} from "@/lib/month-end-close";
import { CheckCircle2, Circle, Lock, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/accounting/month-end")({
  head: () => ({
    meta: [
      { title: "Month-end close | Mattress Maestro ERP" },
      { name: "description", content: "Period-close checklist before locking a financial period." },
    ],
  }),
  component: MonthEndClosePage,
});

function MonthEndClosePage() {
  const periodLabel = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [checklist, setChecklist] = useState(() => createMonthEndChecklist(periodLabel));

  const mark = (taskId: string, status: CloseTaskStatus) => {
    setChecklist((current) => setCloseTaskStatus(current, taskId, status, status === "blocked" ? undefined : undefined));
  };

  return (
    <>
      <PageHeader
        title="Month-end close"
        description={`Checklist for ${checklist.periodLabel}. Completing tasks here does not lock the period — use Financial Years for the admin lock after all items are done.`}
      />
      <PageBody className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Close readiness</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {Math.round(checklist.completionRatio * 100)}% of actionable tasks complete
              </p>
            </div>
            {checklist.readyToClose ? (
              <Badge className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Ready to lock</Badge>
            ) : (
              <Badge variant="secondary" className="gap-1"><Circle className="h-3.5 w-3.5" /> In progress</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={checklist.completionRatio * 100} className="h-2" />
            {checklist.openBlockers.length > 0 && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">Open blockers</div>
                  <ul className="mt-1 list-disc pl-4">
                    {checklist.openBlockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" />
              Period lock remains an admin-only server operation under Accounting → Financial Years.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {checklist.tasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{task.title}</span>
                    <Badge variant="outline" className="capitalize">{task.ownerRole}</Badge>
                    <Badge
                      variant={
                        task.status === "done"
                          ? "secondary"
                          : task.status === "blocked"
                            ? "destructive"
                            : "outline"
                      }
                      className="capitalize"
                    >
                      {task.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{task.description}</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button size="sm" variant={task.status === "done" ? "default" : "outline"} className="min-h-10" onClick={() => mark(task.id, "done")}>
                    Done
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-10" onClick={() => mark(task.id, "pending")}>
                    Pending
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-10" onClick={() => mark(task.id, "blocked")}>
                    Blocked
                  </Button>
                  <Button size="sm" variant="ghost" className="min-h-10" onClick={() => mark(task.id, "na")}>
                    N/A
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageBody>
    </>
  );
}
