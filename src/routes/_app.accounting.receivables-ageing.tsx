import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
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
import { AlertTriangle, RefreshCw } from "lucide-react";
import { inr } from "@/lib/format";
import { buildReceivableAgeing, daysPastDue, type OpenBillBalance } from "@/lib/receivable-ageing";
import { todayIndia } from "@/lib/format";

export const Route = createFileRoute("/_app/accounting/receivables-ageing")({
  head: () => ({
    meta: [
      { title: "Receivables Ageing | Mattress Maestro ERP" },
      { name: "description", content: "Collections ageing from open posted bills." },
    ],
  }),
  component: ReceivablesAgeingPage,
});

function ReceivablesAgeingPage() {
  const { activeCompany, loading: companyLoading } = useCompany();
  const [asOf, setAsOf] = useState(() => todayIndia());

  const query = useQuery({
    queryKey: ["receivables-ageing", activeCompany?.id, asOf],
    enabled: Boolean(activeCompany?.id) && !companyLoading,
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select an active company.");

      // Prefer bill-wise open balances when the view/table is available.
      const { data: bills, error } = await supabase
        .from("bills")
        .select("id, party_id, due_date, original_amount, parties(name)")
        .eq("company_id", activeCompany.id)
        .limit(2000);

      if (error) throw error;

      const billIds = (bills ?? []).map((b) => b.id);
      const allocated = new Map<string, number>();
      if (billIds.length) {
        const { data: allocations, error: aErr } = await supabase
          .from("bill_allocations")
          .select("bill_id, amount, effect")
          .in("bill_id", billIds);
        if (aErr) throw aErr;
        for (const row of allocations ?? []) {
          allocated.set(
            row.bill_id,
            (allocated.get(row.bill_id) ?? 0) + Number(row.amount) * Number(row.effect),
          );
        }
      }

      const openBills: OpenBillBalance[] = [];
      for (const bill of bills ?? []) {
        const applied = allocated.get(bill.id) ?? 0;
        const openAmount = Math.max(0, Number(bill.original_amount) - applied);
        if (openAmount <= 0.009) continue;
        const due = bill.due_date || asOf;
        let dpd = 0;
        try {
          dpd = daysPastDue(due, asOf);
        } catch {
          dpd = 0;
        }
        const partyName =
          bill.parties && typeof bill.parties === "object" && "name" in bill.parties
            ? String((bill.parties as { name?: string }).name ?? bill.party_id)
            : bill.party_id;
        openBills.push({
          billId: bill.id,
          partyId: bill.party_id,
          partyName,
          daysPastDue: dpd,
          openAmount,
        });
      }

      return buildReceivableAgeing(openBills, asOf);
    },
  });

  const report = query.data;
  const bucketKeys = ["current", "1-30", "31-60", "61-90", "90+"] as const;

  const totalsLine = useMemo(() => {
    if (!report) return null;
    return report.totals;
  }, [report]);

  return (
    <>
      <PageHeader
        title="Receivables ageing"
        description="Open bill balances bucketed by days past due. Figures come from posted bills and allocations only."
        actions={
          <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />
      <PageBody className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-4">
            <div className="space-y-1">
              <Label htmlFor="as-of">As of date</Label>
              <Input
                id="as-of"
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="min-h-11 w-48"
              />
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">
              Ageing uses each bill&apos;s due date relative to the as-of date. Zero or negative open
              amounts are excluded. Invalid rows are skipped, never estimated.
            </p>
          </CardContent>
        </Card>

        {query.isError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <span>
              Could not load ageing:{" "}
              {query.error instanceof Error ? query.error.message : "Unknown error"}
            </span>
          </div>
        )}

        {query.isLoading && (
          <div role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">
            Loading open bills…
          </div>
        )}

        {report && (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {bucketKeys.map((key) => (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {key === "current" ? "Current" : key}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold tabular-nums">{inr(totalsLine?.[key] ?? 0)}</div>
                  </CardContent>
                </Card>
              ))}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Total
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-semibold tabular-nums">{inr(totalsLine?.total ?? 0)}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Party</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">1–30</TableHead>
                      <TableHead className="text-right">31–60</TableHead>
                      <TableHead className="text-right">61–90</TableHead>
                      <TableHead className="text-right">90+</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No open receivables for this company at the selected as-of date.
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.rows.map((row) => (
                        <TableRow key={row.partyId}>
                          <TableCell className="font-medium">{row.partyName}</TableCell>
                          {bucketKeys.map((key) => (
                            <TableCell key={key} className="text-right tabular-nums">
                              {inr(row.buckets[key])}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-medium tabular-nums">{inr(row.total)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {report.skippedInvalid > 0 && (
              <p className="text-xs text-muted-foreground">
                Skipped {report.skippedInvalid} invalid bill row(s) with non-positive or non-finite amounts.
              </p>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
