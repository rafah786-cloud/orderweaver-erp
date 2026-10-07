import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import {
  sb,
  type Voucher,
  type VoucherEntry,
  type LedgerAccount,
  type LedgerBalance,
  VOUCHER_TYPE_LABEL,
} from "@/lib/accounting";
import { inr, formatDate, todayIndia } from "@/lib/format";
import { ArrowLeft, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_app/accounting/ledger/$id")({
  component: LedgerStatementPage,
});

function LedgerStatementPage() {
  const { id } = Route.useParams();
  const today = todayIndia();
  const fyStart = "2025-04-01";
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today);

  const ledgerQ = useQuery({
    queryKey: ["ledger", id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("ledger_accounts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as LedgerAccount | null;
    },
  });

  const balanceQ = useQuery({
    queryKey: ["ledger_balance", id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("ledger_balances")
        .select("*")
        .eq("ledger_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as LedgerBalance | null;
    },
  });

  const entriesQ = useQuery({
    queryKey: ["ledger_entries", id, from, to],
    queryFn: async () => {
      const { data: entries, error } = await sb
        .from("voucher_entries")
        .select(
          "*,vouchers!inner(id,voucher_number,voucher_type,voucher_date,narration,source_table,source_id)",
        )
        .eq("ledger_account_id", id)
        .gte("vouchers.voucher_date", from)
        .lte("vouchers.voucher_date", to)
        .order("voucher_date", { foreignTable: "vouchers", ascending: true });
      if (error) throw error;
      return entries as (VoucherEntry & { vouchers: Voucher })[];
    },
  });

  const rows = useMemo(() => {
    if (!entriesQ.data || !balanceQ.data) return [];
    const opening =
      balanceQ.data.opening_balance_type === "dr"
        ? Number(balanceQ.data.opening_balance)
        : -Number(balanceQ.data.opening_balance);
    let running = opening;
    return entriesQ.data.map((e) => {
      running += Number(e.debit) - Number(e.credit);
      return { entry: e, running };
    });
  }, [entriesQ.data, balanceQ.data]);

  const openingBalance = balanceQ.data
    ? (balanceQ.data.opening_balance_type === "dr" ? 1 : -1) * Number(balanceQ.data.opening_balance)
    : 0;
  const totalDr = entriesQ.data?.reduce((s, e) => s + Number(e.debit), 0) ?? 0;
  const totalCr = entriesQ.data?.reduce((s, e) => s + Number(e.credit), 0) ?? 0;
  const closingBalance = openingBalance + totalDr - totalCr;

  return (
    <>
      <PageHeader
        title={ledgerQ.data?.name ?? "Ledger"}
        description={balanceQ.data?.group_name}
        actions={
          <Button asChild variant="ghost">
            <Link to="/accounting/ledgers">
              <ArrowLeft className="h-4 w-4 mr-1" /> All Ledgers
            </Link>
          </Button>
        }
      />
      <PageBody>
        <Card className="mb-4">
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">From</label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">To</label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="ml-auto flex gap-6 text-right">
              <div>
                <div className="text-xs text-muted-foreground">Opening</div>
                <div className="font-semibold tabular-nums">
                  {inr(Math.abs(openingBalance))} {openingBalance >= 0 ? "Dr" : "Cr"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Closing</div>
                <div className="font-semibold tabular-nums">
                  {inr(Math.abs(closingBalance))} {closingBalance >= 0 ? "Dr" : "Cr"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-32">Voucher</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="text-right w-28">Debit</TableHead>
                  <TableHead className="text-right w-28">Credit</TableHead>
                  <TableHead className="text-right w-32">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/30 italic">
                  <TableCell>{formatDate(from)}</TableCell>
                  <TableCell colSpan={2}>Opening Balance</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inr(Math.abs(openingBalance))} {openingBalance >= 0 ? "Dr" : "Cr"}
                  </TableCell>
                </TableRow>
                {rows.map(({ entry, running }) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm">
                      {formatDate(entry.vouchers.voucher_date)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link
                        to="/accounting/voucher/$id"
                        params={{ id: entry.vouchers.id }}
                        className="hover:underline inline-flex items-center gap-1"
                      >
                        {entry.vouchers.voucher_number}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        {VOUCHER_TYPE_LABEL[entry.vouchers.voucher_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.narration ?? entry.vouchers.narration ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(entry.debit) > 0 ? inr(Number(entry.debit)) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(entry.credit) > 0 ? inr(Number(entry.credit)) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {inr(Math.abs(running))} {running >= 0 ? "Dr" : "Cr"}
                    </TableCell>
                  </TableRow>
                ))}
                {entriesQ.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No transactions in this period.
                    </TableCell>
                  </TableRow>
                )}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(totalDr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(totalCr)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inr(Math.abs(closingBalance))} {closingBalance >= 0 ? "Dr" : "Cr"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
