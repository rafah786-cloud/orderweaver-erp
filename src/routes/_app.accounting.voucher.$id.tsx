import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sb, type Voucher, type VoucherEntry, type LedgerAccount, VOUCHER_TYPE_LABEL } from "@/lib/accounting";
import { inr, formatDate } from "@/lib/format";
import { ArrowLeft, FileText, Truck, Lock } from "lucide-react";

export const Route = createFileRoute("/_app/accounting/voucher/$id")({
  component: VoucherDetailPage,
});

function VoucherDetailPage() {
  const { id } = Route.useParams();

  const q = useQuery({
    queryKey: ["voucher", id],
    queryFn: async () => {
      const { data: v, error } = await sb.from("vouchers").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!v) return null;
      const { data: entries, error: eErr } = await sb.from("voucher_entries").select("*").eq("voucher_id", id).order("line_order");
      if (eErr) throw eErr;
      const ledgerIds = [...new Set((entries as VoucherEntry[]).map((e) => e.ledger_account_id))];
      const { data: ledgers, error: lErr } = await sb.from("ledger_accounts").select("*").in("id", ledgerIds);
      if (lErr) throw lErr;
      return { voucher: v as Voucher, entries: entries as VoucherEntry[], ledgers: ledgers as LedgerAccount[] };
    },
  });

  if (q.isLoading) return <PageBody><p className="text-muted-foreground">Loading…</p></PageBody>;
  if (!q.data) return <PageBody><p className="text-muted-foreground">Voucher not found.</p></PageBody>;

  const { voucher, entries, ledgers } = q.data;
  const ledgerMap = new Map(ledgers.map((l) => [l.id, l]));
  const totalDr = entries.reduce((s, e) => s + Number(e.debit), 0);
  const totalCr = entries.reduce((s, e) => s + Number(e.credit), 0);

  const sourceLink =
    voucher.source_table === "invoices" && voucher.source_id
      ? { to: "/print/invoice/$id" as const, params: { id: voucher.source_id }, label: "View Invoice", Icon: FileText }
      : voucher.source_table === "purchase_bills" && voucher.source_id
      ? { to: "/print/purchase/$id" as const, params: { id: voucher.source_id }, label: "View Bill", Icon: Truck }
      : null;

  return (
    <>
      <PageHeader
        title={`${VOUCHER_TYPE_LABEL[voucher.voucher_type]} · ${voucher.voucher_number}`}
        description={formatDate(voucher.voucher_date) + (voucher.reference ? ` · Ref: ${voucher.reference}` : "")}
        actions={
          <div className="flex items-center gap-2">
            {voucher.is_locked && <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" /> Locked</Badge>}
            {sourceLink && (
              <Button asChild variant="outline">
                <Link to={sourceLink.to} params={sourceLink.params}><sourceLink.Icon className="h-4 w-4 mr-1" /> {sourceLink.label}</Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link to="/accounting/day-book"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
            </Button>
          </div>
        }
      />
      <PageBody>
        {voucher.narration && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="text-xs uppercase text-muted-foreground mb-1">Narration</div>
              <div className="text-sm">{voucher.narration}</div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Ledger</TableHead>
                  <TableHead className="text-right w-32">Debit</TableHead>
                  <TableHead className="text-right w-32">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, i) => {
                  const l = ledgerMap.get(e.ledger_account_id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        {l ? (
                          <Link to="/accounting/ledger/$id" params={{ id: l.id }} className="font-medium hover:underline">
                            {l.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                        {e.narration && <div className="text-xs text-muted-foreground mt-0.5">{e.narration}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number(e.debit) > 0 ? inr(Number(e.debit)) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(e.credit) > 0 ? inr(Number(e.credit)) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell></TableCell>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(totalDr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(totalCr)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {Math.abs(totalDr - totalCr) > 0.01 && (
          <div className="mt-4 p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-sm text-destructive">
            ⚠ This voucher is not balanced (Dr ≠ Cr by {inr(Math.abs(totalDr - totalCr))})
          </div>
        )}
      </PageBody>
    </>
  );
}
