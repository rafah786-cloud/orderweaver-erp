import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { sb, type Voucher, type VoucherType, VOUCHER_TYPE_LABEL } from "@/lib/accounting";
import { inr, formatDate, todayIndia } from "@/lib/format";
import { Plus, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_app/accounting/day-book")({
  component: DayBookPage,
});

const ALL_TYPES: (VoucherType | "all")[] = [
  "all",
  "sales",
  "purchase",
  "receipt",
  "payment",
  "contra",
  "journal",
  "debit_note",
  "credit_note",
  "stock_journal",
];

function DayBookPage() {
  const today = todayIndia();
  const monthStart = new Date(`${today}T00:00:00Z`);
  monthStart.setUTCDate(1);
  const [from, setFrom] = useState(monthStart.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [type, setType] = useState<VoucherType | "all">("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["vouchers", from, to, type, search],
    queryFn: async () => {
      let query = sb
        .from("vouchers")
        .select("*")
        .gte("voucher_date", from)
        .lte("voucher_date", to)
        .order("voucher_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (type !== "all") query = query.eq("voucher_type", type);
      if (search.trim()) query = query.ilike("voucher_number", `%${search.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data as Voucher[];
    },
  });

  const totalsQ = useQuery({
    queryKey: ["voucher_totals", q.data?.map((v) => v.id).join(",")],
    enabled: !!q.data && q.data.length > 0,
    queryFn: async () => {
      const ids = q.data!.map((v) => v.id);
      const { data, error } = await sb
        .from("voucher_entries")
        .select("voucher_id,debit")
        .in("voucher_id", ids);
      if (error) throw error;
      const totals = new Map<string, number>();
      for (const row of data as { voucher_id: string; debit: number }[]) {
        totals.set(row.voucher_id, (totals.get(row.voucher_id) ?? 0) + Number(row.debit ?? 0));
      }
      return totals;
    },
  });

  return (
    <>
      <PageHeader
        title="Day Book"
        description="All vouchers in chronological order. Click to view full entry."
        actions={
          <Button asChild>
            <Link to="/accounting/vouchers/new">
              <Plus className="h-4 w-4 mr-1" /> New Voucher
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
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Type</label>
              <Select value={type} onValueChange={(v) => setType(v as VoucherType | "all")}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === "all" ? "All types" : VOUCHER_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground block mb-1">Search voucher #</label>
              <Input
                placeholder="SAL/0001..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-32">Voucher #</TableHead>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="w-32 text-right">Amount</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data?.map((v) => (
                  <TableRow key={v.id} className="cursor-pointer">
                    <TableCell className="text-sm">{formatDate(v.voucher_date)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link
                        to="/accounting/voucher/$id"
                        params={{ id: v.id }}
                        className="hover:underline"
                      >
                        {v.voucher_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {VOUCHER_TYPE_LABEL[v.voucher_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {v.narration ?? v.reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {totalsQ.data ? inr(totalsQ.data.get(v.id) ?? 0) : "—"}
                    </TableCell>
                    <TableCell>
                      <Link to="/accounting/voucher/$id" params={{ id: v.id }}>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {q.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No vouchers in this range.
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
