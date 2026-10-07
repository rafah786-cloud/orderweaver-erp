import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sb, type LedgerBalance } from "@/lib/accounting";
import { inr, todayIndia } from "@/lib/format";

export const Route = createFileRoute("/_app/accounting/trial-balance")({
  head: () => ({
    meta: [
      { title: "Trial Balance | Mattress Maestro ERP" },
      { name: "description", content: "Review ledger balances and financial integrity." },
    ],
  }),
  component: TrialBalancePage,
});

function TrialBalancePage() {
  const today = new Date();
  const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const [startDate, setStartDate] = useState(`${fyStartYear}-04-01`);
  const [endDate, setEndDate] = useState(todayIndia());
  const q = useQuery({
    queryKey: ["trial_balance", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await sb.rpc("get_ledger_balances_period", {
        p_start: startDate,
        p_end: endDate,
      });
      if (error) throw error;
      return data as LedgerBalance[];
    },
    enabled: !!startDate && !!endDate && startDate <= endDate,
  });

  const rows = q.data ?? [];
  let totalDr = 0;
  let totalCr = 0;
  for (const r of rows) {
    if (r.closing_balance >= 0) totalDr += r.closing_balance;
    else totalCr += -r.closing_balance;
  }

  return (
    <>
      <PageHeader
        title="Trial Balance"
        description="Closing balance of every ledger for the selected period."
      />
      <PageBody>
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-xs text-muted-foreground mb-1">From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3"
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-muted-foreground mb-1">To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3"
                />
              </label>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ledger</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right w-32">Debit</TableHead>
                  <TableHead className="text-right w-32">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.ledger_id}>
                    <TableCell>
                      <Link
                        to="/accounting/ledger/$id"
                        params={{ id: r.ledger_id }}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.group_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.closing_balance >= 0 ? inr(r.closing_balance) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.closing_balance < 0 ? inr(-r.closing_balance) : ""}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell colSpan={2}>Grand Total</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(totalDr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(totalCr)}</TableCell>
                </TableRow>
                {Math.abs(totalDr - totalCr) > 0.5 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-amber-600 text-sm py-3">
                      ⚠ Difference of {inr(Math.abs(totalDr - totalCr))} — check Opening Balance
                      Equity.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
