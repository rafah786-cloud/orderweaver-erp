import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sb } from "@/lib/accounting";
import {
  type GstReturn,
  fetchPeriodInvoices,
  fetchPartiesMap,
  buildHsnSummary,
  MONTH_NAMES,
  generateReturn,
} from "@/lib/gst";
import { downloadJson } from "@/lib/gstr1";
import { inr, formatDate } from "@/lib/format";
import { Download, RefreshCw, CheckCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/gst/returns/$id")({
  component: ReturnDetail,
});

function ReturnDetail() {
  const { id } = useParams({ from: "/_app/gst/returns/$id" });
  const qc = useQueryClient();

  const rq = useQuery({
    queryKey: ["gst_return", id],
    queryFn: async () => {
      const { data, error } = await sb.from("gst_returns").select("*").eq("id", id).single();
      if (error) throw error;
      return data as GstReturn;
    },
  });

  const ret = rq.data;
  const periodInvoicesQ = useQuery({
    queryKey: ["gst_period_invoices", ret?.period_year, ret?.period_month],
    enabled: !!ret && !!ret.period_month,
    queryFn: async () => {
      const invs = await fetchPeriodInvoices(ret!.period_year, ret!.period_month!);
      const parties = await fetchPartiesMap([...new Set(invs.map((i) => i.party_id))]);
      return { invs, parties };
    },
  });

  const regen = useMutation({
    mutationFn: () =>
      generateReturn({
        type: ret!.return_type,
        year: ret!.period_year,
        month: ret!.period_month ?? 1,
        gstin: ret!.gstin,
        supplierStateCode: ret!.gstin.trim().slice(0, 2),
      }),
    onSuccess: () => {
      toast.success("Re-generated");
      qc.invalidateQueries({ queryKey: ["gst_return", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markFiled = useMutation({
    mutationFn: async () => {
      const { error } = await sb
        .from("gst_returns")
        .update({ status: "filed", filed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as filed");
      qc.invalidateQueries({ queryKey: ["gst_return", id] });
    },
  });

  if (rq.isLoading || !ret)
    return (
      <PageBody>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent>
        </Card>
      </PageBody>
    );

  const periodLabel = ret.period_month
    ? `${MONTH_NAMES[ret.period_month - 1]} ${ret.period_year}`
    : `FY ${ret.period_year}`;
  const filename = `${ret.return_type}_${ret.gstin}_${ret.period_year}${ret.period_month ? `-${String(ret.period_month).padStart(2, "0")}` : ""}.json`;

  return (
    <>
      <PageHeader
        title={`${ret.return_type} · ${periodLabel}`}
        description={`GSTIN ${ret.gstin} · status: ${ret.status}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => regen.mutate()} disabled={regen.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" /> Re-generate
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadJson(filename, ret.payload)}
              disabled={!ret.payload}
            >
              <Download className="h-4 w-4 mr-1" /> Export JSON
            </Button>
            {ret.status !== "filed" && (
              <Button onClick={() => markFiled.mutate()}>
                <CheckCircle className="h-4 w-4 mr-1" /> Mark Filed
              </Button>
            )}
          </div>
        }
      />
      <PageBody>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <Stat label="Invoices" value={String(ret.summary?.invoice_count ?? "—")} />
          <Stat label="Taxable Value" value={inr(ret.summary?.taxable_value ?? 0)} />
          <Stat label="IGST" value={inr(ret.summary?.igst ?? 0)} />
          <Stat label="CGST" value={inr(ret.summary?.cgst ?? 0)} />
          <Stat label="SGST" value={inr(ret.summary?.sgst ?? 0)} />
        </div>

        {ret.return_type === "GSTR-1" && ret.period_month && (
          <Tabs defaultValue="b2b" className="w-full">
            <TabsList>
              <TabsTrigger value="b2b">B2B</TabsTrigger>
              <TabsTrigger value="b2cs">B2CS</TabsTrigger>
              <TabsTrigger value="hsn">HSN Summary</TabsTrigger>
              <TabsTrigger value="raw">Raw JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="b2b">
              <B2bTable data={periodInvoicesQ.data} />
            </TabsContent>
            <TabsContent value="b2cs">
              <B2csTable data={periodInvoicesQ.data} />
            </TabsContent>
            <TabsContent value="hsn">
              <HsnTable data={periodInvoicesQ.data} supplierStateCode={ret.gstin.trim().slice(0, 2)} />
            </TabsContent>
            <TabsContent value="raw">
              <Card>
                <CardContent className="p-4 max-h-[600px] overflow-auto">
                  <pre className="text-xs">{JSON.stringify(ret.payload, null, 2)}</pre>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {ret.return_type === "GSTR-3B" && <Gstr3bView payload={ret.payload} />}

        {ret.return_type === "GSTR-9" && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Annual return aggregation — generate after filing 12 monthly GSTR-1 + GSTR-3B.
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function B2bTable({
  data,
}: {
  data:
    | {
        invs: Awaited<ReturnType<typeof fetchPeriodInvoices>>;
        parties: Map<
          string,
          { id: string; name: string; gstin: string | null; state_code: string | null }
        >;
      }
    | undefined;
}) {
  if (!data)
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  const rows = data.invs.filter((i) => {
    const p = data.parties.get(i.party_id);
    return p?.gstin && /^\d{2}[A-Z0-9]{13}$/.test(p.gstin.trim());
  });
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => {
              const p = data.parties.get(i.party_id);
              return (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                  <TableCell className="text-sm">{formatDate(i.invoice_date)}</TableCell>
                  <TableCell className="text-sm">{p?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{p?.gstin}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {inr(i.subtotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {inr(i.tax_amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {inr(i.total_amount)}
                  </TableCell>
                  <TableCell>
                    <Link to="/print/invoice/$id" params={{ id: i.id }}>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  No B2B invoices.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function B2csTable({
  data,
}: {
  data:
    | {
        invs: Awaited<ReturnType<typeof fetchPeriodInvoices>>;
        parties: Map<
          string,
          { id: string; name: string; gstin: string | null; state_code: string | null }
        >;
      }
    | undefined;
}) {
  if (!data)
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  const rows = data.invs.filter((i) => {
    const p = data.parties.get(i.party_id);
    return !p?.gstin || !/^\d{2}[A-Z0-9]{13}$/.test(p.gstin.trim());
  });
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>POS</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => {
              const p = data.parties.get(i.party_id);
              return (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                  <TableCell className="text-sm">{formatDate(i.invoice_date)}</TableCell>
                  <TableCell className="text-sm">{p?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {p?.state_code ?? i.place_of_supply ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {inr(i.subtotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {inr(i.tax_amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {inr(i.total_amount)}
                  </TableCell>
                  <TableCell>
                    <Link to="/print/invoice/$id" params={{ id: i.id }}>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  No B2C invoices.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function HsnTable({
  data,
  supplierStateCode,
}: {
  supplierStateCode: string;
  data:
    | {
        invs: Awaited<ReturnType<typeof fetchPeriodInvoices>>;
        parties: Map<
          string,
          { id: string; name: string; gstin: string | null; state_code: string | null }
        >;
      }
    | undefined;
}) {
  if (!data)
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  const rows = buildHsnSummary(data.invs, data.parties, supplierStateCode);
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>HSN</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate %</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">IGST</TableHead>
              <TableHead className="text-right">CGST</TableHead>
              <TableHead className="text-right">SGST</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.hsn_code}-${r.rate}`}>
                <TableCell className="font-mono text-xs">{r.hsn_code}</TableCell>
                <TableCell className="text-sm">{r.description}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{r.total_qty}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{r.rate}%</TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {inr(r.taxable_value)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">{inr(r.igst)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{inr(r.cgst)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{inr(r.sgst)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {inr(r.total_value)}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                  No HSN data.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Gstr3bView({ payload }: { payload: unknown }) {
  const p = (payload ?? {}) as Record<string, number>;
  const row = (label: string, key: string) => (
    <TableRow>
      <TableCell className="text-sm">{label}</TableCell>
      <TableCell className="text-right tabular-nums text-sm">{inr(p[key] ?? 0)}</TableCell>
    </TableRow>
  );
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b bg-muted/30 font-semibold text-sm">
            3.1 Outward Supplies & Tax
          </div>
          <Table>
            <TableBody>
              {row("(a) Outward taxable", "outward_taxable")}
              {row("(b) Zero-rated (export/SEZ)", "outward_zero_rated")}
              {row("(c) Nil rated / exempt", "outward_nil_rated")}
              {row("(d) Inward attracting RCM", "outward_inward_rcm")}
              {row("(e) Non-GST outward", "outward_non_gst")}
              {row("IGST payable", "igst_payable")}
              {row("CGST payable", "cgst_payable")}
              {row("SGST payable", "sgst_payable")}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b bg-muted/30 font-semibold text-sm">
            4. Eligible ITC
          </div>
          <Table>
            <TableBody>
              {row("ITC on inputs", "itc_inputs")}
              {row("ITC on capital goods", "itc_capital")}
              {row("ITC on input services", "itc_services")}
              {row("ITC reversed (ineligible)", "itc_reversed")}
              {row("IGST ITC", "igst_itc")}
              {row("CGST ITC", "cgst_itc")}
              {row("SGST ITC", "sgst_itc")}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
