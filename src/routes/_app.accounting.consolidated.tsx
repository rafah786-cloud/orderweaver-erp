import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sb } from "@/lib/accounting";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/_app/accounting/consolidated")({
  component: ConsolidatedAccountingPage,
});

type Row = {
  company_id: string;
  company_code: string;
  company_name: string;
  ledger_id: string;
  ledger_name: string;
  group_name: string;
  debit: number;
  credit: number;
};

function ConsolidatedAccountingPage() {
  const q = useQuery({
    queryKey: ["consolidated_trial_balance"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("get_consolidated_trial_balance", {
        p_as_of: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];
  const totalDr = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const totalCr = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
  const byCompany = new Map<
    string,
    { name: string; code: string; debit: number; credit: number; ledgers: number }
  >();
  for (const r of rows) {
    const g = byCompany.get(r.company_id) ?? {
      name: r.company_name,
      code: r.company_code,
      debit: 0,
      credit: 0,
      ledgers: 0,
    };
    g.debit += Number(r.debit || 0);
    g.credit += Number(r.credit || 0);
    g.ledgers++;
    byCompany.set(r.company_id, g);
  }

  return (
    <>
      <PageHeader
        title="Consolidated Accounting"
        description="Read-only group view across companies you are authorized to see."
      />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-3 mb-4">
          <Metric title="Companies" value={byCompany.size.toString()} />
          <Metric title="Total Debit" value={inr(totalDr)} />
          <Metric title="Total Credit" value={inr(totalCr)} />
        </div>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Company totals</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...byCompany.values()].map((c) => (
                  <TableRow key={c.code}>
                    <TableCell className="font-medium">
                      {c.code} · {c.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(c.debit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(c.credit)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell>Group Total</TableCell>
                  <TableCell className="text-right">{inr(totalDr)}</TableCell>
                  <TableCell className="text-right">{inr(totalCr)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ledger detail</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Ledger</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.company_id + "|" + r.ledger_id}>
                    <TableCell className="text-xs">{r.company_code}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.group_name}</TableCell>
                    <TableCell>{r.ledger_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.debit ? inr(r.debit) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.credit ? inr(r.credit) : ""}
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

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
