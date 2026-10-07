import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { useState } from "react";
import { sb } from "@/lib/accounting";
import { generateReturn, type GstReturn, type ReturnType, MONTH_NAMES } from "@/lib/gst";
import { inr, formatDate } from "@/lib/format";
import { ExternalLink, Play, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/lib/company-context";

export const Route = createFileRoute("/_app/gst/returns")({
  component: ReturnsPage,
});

const TYPES: ReturnType[] = ["GSTR-1", "GSTR-3B", "GSTR-9"];

function ReturnsPage() {
  const { activeCompany } = useCompany();
  const qc = useQueryClient();
  const now = new Date();
  const [type, setType] = useState<ReturnType>("GSTR-1");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth());

  const listQ = useQuery({
    queryKey: ["gst_returns"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("gst_returns")
        .select("*")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as GstReturn[];
    },
  });

  const generate = useMutation({
    mutationFn: () =>
      generateReturn({
        type,
        year,
        month,
        gstin: activeCompany?.gstin ?? "",
        supplierStateCode: activeCompany?.gstin?.trim().slice(0, 2) ?? "",
      }),
    onSuccess: ({ id }) => {
      toast.success(`${type} ${MONTH_NAMES[month - 1]} ${year} generated`);
      qc.invalidateQueries({ queryKey: ["gst_returns"] });
      // optimistic nav
      window.location.assign(`/gst/returns/${id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <>
      <PageHeader title="GST Returns" description="Generate and review GSTR-1, GSTR-3B, GSTR-9." />
      <PageBody>
        <Card className="mb-4">
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Return type</label>
              <Select value={type} onValueChange={(v) => setType(v as ReturnType)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {type !== "GSTR-9" && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Month</label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Year</label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
              <Play className="h-4 w-4 mr-1" /> {generate.isPending ? "Generating..." : "Generate"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead className="w-32">Period</TableHead>
                  <TableHead className="w-32">GSTIN</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">Total Tax</TableHead>
                  <TableHead className="w-28">Generated</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.data?.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline">{r.return_type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.period_month ? MONTH_NAMES[r.period_month - 1] : "Annual"} {r.period_year}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.gstin}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "filed" ? "default" : "secondary"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {inr(r.summary?.taxable_value ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {inr(r.summary?.total_tax ?? 0)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(r.updated_at)}
                    </TableCell>
                    <TableCell>
                      <Link to="/gst/returns/$id" params={{ id: r.id }}>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {listQ.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No returns generated yet.
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
