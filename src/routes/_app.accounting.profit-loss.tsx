import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sb, type LedgerBalance } from "@/lib/accounting";
import { inr } from "@/lib/format";
import { useMemo } from "react";

export const Route = createFileRoute("/_app/accounting/profit-loss")({
  component: ProfitLossPage,
});

function ProfitLossPage() {
  const q = useQuery({
    queryKey: ["pnl"],
    queryFn: async () => {
      const { data, error } = await sb.from("ledger_balances").select("*").in("nature", ["income", "expenses"]).order("group_name").order("name");
      if (error) throw error;
      return data as LedgerBalance[];
    },
  });

  const { incomeGroups, expenseGroups, totalIncome, totalExpense } = useMemo(() => {
    const rows = q.data ?? [];
    // Income ledgers normally have credit balance → closing_balance negative; flip for display
    // Expense ledgers normally have debit balance → closing_balance positive.
    const grouped = new Map<string, { nature: "income" | "expenses"; total: number; ledgers: { id: string; name: string; amount: number }[] }>();
    for (const r of rows) {
      const amount = r.nature === "income" ? -r.closing_balance : r.closing_balance;
      const g = grouped.get(r.group_name) ?? { nature: r.nature as "income" | "expenses", total: 0, ledgers: [] };
      g.total += amount;
      g.ledgers.push({ id: r.ledger_id, name: r.name, amount });
      grouped.set(r.group_name, g);
    }
    const incomeGroups = [...grouped.entries()].filter(([, g]) => g.nature === "income");
    const expenseGroups = [...grouped.entries()].filter(([, g]) => g.nature === "expenses");
    const totalIncome = incomeGroups.reduce((s, [, g]) => s + g.total, 0);
    const totalExpense = expenseGroups.reduce((s, [, g]) => s + g.total, 0);
    return { incomeGroups, expenseGroups, totalIncome, totalExpense };
  }, [q.data]);

  const profit = totalIncome - totalExpense;

  return (
    <>
      <PageHeader title="Profit & Loss" description="Income vs Expenses for the current period." />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PnlSide title="Expenses" groups={expenseGroups} total={totalExpense} extraRow={profit > 0 ? { name: "Net Profit", amount: profit } : null} />
          <PnlSide title="Income" groups={incomeGroups} total={totalIncome} extraRow={profit < 0 ? { name: "Net Loss", amount: -profit } : null} />
        </div>
        <Card className="mt-4">
          <CardContent className="p-4 flex justify-between items-center">
            <div className="text-sm text-muted-foreground">Net Result</div>
            <div className={`text-xl font-semibold tabular-nums ${profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {profit >= 0 ? "Profit" : "Loss"}: {inr(Math.abs(profit))}
            </div>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

function PnlSide({
  title, groups, total, extraRow,
}: {
  title: string;
  groups: [string, { total: number; ledgers: { id: string; name: string; amount: number }[] }][];
  total: number;
  extraRow: { name: string; amount: number } | null;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b font-semibold">{title}</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="text-right w-32">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(([groupName, g]) => (
              <>
                <TableRow key={groupName} className="bg-muted/20">
                  <TableCell className="font-medium text-sm">{groupName}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(g.total)}</TableCell>
                </TableRow>
                {g.ledgers.filter((l) => Math.abs(l.amount) > 0.01).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="pl-8 text-sm text-muted-foreground">
                      <Link to="/accounting/ledger/$id" params={{ id: l.id }} className="hover:underline">{l.name}</Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{inr(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </>
            ))}
            {extraRow && (
              <TableRow className="font-medium italic bg-amber-50 dark:bg-amber-950/20">
                <TableCell>{extraRow.name}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(extraRow.amount)}</TableCell>
              </TableRow>
            )}
            <TableRow className="font-semibold bg-muted/40">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{inr(total + (extraRow?.amount ?? 0))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
