import { Fragment } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sb, type LedgerBalance } from "@/lib/accounting";
import { inr } from "@/lib/format";
import { useMemo } from "react";

export const Route = createFileRoute("/_app/accounting/balance-sheet")({
  component: BalanceSheetPage,
});

function BalanceSheetPage() {
  const balQ = useQuery({
    queryKey: ["bs_balances"],
    queryFn: async () => {
      const { data, error } = await sb.from("ledger_balances").select("*").order("group_name").order("name");
      if (error) throw error;
      return data as LedgerBalance[];
    },
  });

  const { assets, liabilities, pnlProfit } = useMemo(() => {
    const rows = balQ.data ?? [];
    const assets: typeof rows = [];
    const liabilities: typeof rows = [];
    let totalIncome = 0;
    let totalExpense = 0;
    for (const r of rows) {
      if (r.nature === "assets") assets.push(r);
      else if (r.nature === "liabilities") liabilities.push(r);
      else if (r.nature === "income") totalIncome += -r.closing_balance;
      else if (r.nature === "expenses") totalExpense += r.closing_balance;
    }
    return { assets, liabilities, pnlProfit: totalIncome - totalExpense };
  }, [balQ.data]);

  const groupBy = (list: LedgerBalance[]) => {
    const m = new Map<string, { total: number; ledgers: LedgerBalance[] }>();
    for (const r of list) {
      const g = m.get(r.group_name) ?? { total: 0, ledgers: [] };
      g.ledgers.push(r);
      g.total += r.nature === "assets" ? r.closing_balance : -r.closing_balance;
      m.set(r.group_name, g);
    }
    return [...m.entries()];
  };

  const assetGroups = groupBy(assets);
  const liabilityGroups = groupBy(liabilities);
  const totalAssets = assetGroups.reduce((s, [, g]) => s + g.total, 0);
  const totalLiabilities = liabilityGroups.reduce((s, [, g]) => s + g.total, 0) + pnlProfit;

  return (
    <>
      <PageHeader title="Balance Sheet" description="Assets, liabilities, and capital — including current period profit." />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BsSide
            title="Liabilities"
            groups={liabilityGroups}
            sign={-1}
            total={totalLiabilities}
            extraRow={Math.abs(pnlProfit) > 0.01 ? { name: pnlProfit >= 0 ? "Profit & Loss A/c (Profit)" : "Profit & Loss A/c (Loss)", amount: pnlProfit } : null}
          />
          <BsSide title="Assets" groups={assetGroups} sign={1} total={totalAssets} extraRow={null} />
        </div>
        {Math.abs(totalAssets - totalLiabilities) > 0.5 && (
          <Card className="mt-4 border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20">
            <CardContent className="p-3 text-sm text-amber-700 dark:text-amber-400">
              ⚠ Balance sheet doesn't tally by {inr(Math.abs(totalAssets - totalLiabilities))}. Check opening balances.
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  );
}

function BsSide({
  title, groups, sign, total, extraRow,
}: {
  title: string;
  groups: [string, { total: number; ledgers: LedgerBalance[] }][];
  sign: 1 | -1;
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
                {g.ledgers.filter((l) => Math.abs(l.closing_balance) > 0.01).map((l) => {
                  const amount = sign * l.closing_balance;
                  return (
                    <TableRow key={l.ledger_id}>
                      <TableCell className="pl-8 text-sm text-muted-foreground">
                        <Link to="/accounting/ledger/$id" params={{ id: l.ledger_id }} className="hover:underline">{l.name}</Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{inr(amount)}</TableCell>
                    </TableRow>
                  );
                })}
              </>
            ))}
            {extraRow && (
              <TableRow className="font-medium italic bg-emerald-50 dark:bg-emerald-950/20">
                <TableCell>{extraRow.name}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(extraRow.amount)}</TableCell>
              </TableRow>
            )}
            <TableRow className="font-semibold bg-muted/40">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{inr(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
