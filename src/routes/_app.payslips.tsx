import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { inr } from "@/lib/format";
import { toast } from "sonner";
import { generatePayslips } from "@/lib/payslips.functions";

export const Route = createFileRoute("/_app/payslips")({ component: PayslipsPage });

function PayslipsPage() {
  const { hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const gen = useServerFn(generatePayslips);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: payslips } = useQuery({
    queryKey: ["payslips", year, month],
    queryFn: async () => {
      const { data } = await supabase
        .from("payslips")
        .select("*, employees(full_name, employee_code)")
        .eq("period_year", year)
        .eq("period_month", month);
      return data ?? [];
    },
  });

  const canGenerate = hasAnyRole(["admin", "hr"]);

  return (
    <>
      <PageHeader
        title="Payslips"
        description="Auto-calculated from attendance and pay structure."
      />
      <PageBody>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Monthly Payslips</CardTitle>
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-xs">Year</Label>
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-24"
                />
              </div>
              <div>
                <Label className="text-xs">Month</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="w-20"
                />
              </div>
              {canGenerate && (
                <Button
                  onClick={async () => {
                    try {
                      const r = await gen({ data: { year, month } });
                      toast.success(`Generated ${r.count} payslips`);
                      qc.invalidateQueries({ queryKey: ["payslips"] });
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Generate
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Days Worked</TableHead>
                  <TableHead>Absent</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(payslips ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No payslips for this period.
                    </TableCell>
                  </TableRow>
                )}
                {(payslips ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {(p as { employees?: { full_name?: string } }).employees?.full_name ?? "—"}
                    </TableCell>
                    <TableCell>{Number(p.days_worked)}</TableCell>
                    <TableCell>{Number(p.days_absent)}</TableCell>
                    <TableCell>{inr(Number(p.gross_salary))}</TableCell>
                    <TableCell>{inr(Number(p.deductions))}</TableCell>
                    <TableCell className="font-semibold">{inr(Number(p.net_salary))}</TableCell>
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
