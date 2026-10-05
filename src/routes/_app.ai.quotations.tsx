import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GitCompare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { Markdown } from "@/components/ai/Markdown";
import { compareQuotationDocuments, listAiDocuments } from "@/lib/ai.functions";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/_app/ai/quotations")({ component: QuotationsPage });

interface DocRow {
  id: string;
  title: string;
  doc_kind: string;
  extraction_status: string;
  quotation_group: string | null;
  suppliers: { name: string } | null;
}

interface Comparison {
  suppliers: {
    supplier: string;
    validity?: string | null;
    deliveryTerms?: string | null;
    paymentTerms?: string | null;
    total?: number | null;
  }[];
  materials: {
    material: string;
    unit?: string | null;
    previousRate?: number | null;
    offers: {
      supplier: string;
      rate: number | null;
      gstPct?: number | null;
      spec?: string | null;
      landed?: number | null;
    }[];
    bestSupplier?: string | null;
  }[];
  analysis?: string | null;
}

function QuotationsPage() {
  const list = useServerFn(listAiDocuments);
  const compare = useServerFn(compareQuotationDocuments);
  const [selected, setSelected] = useState<string[]>([]);

  const docs = useQuery({ queryKey: ["ai-documents"], queryFn: () => list() });
  const quotes = useMemo(
    () =>
      ((docs.data ?? []) as unknown as DocRow[]).filter(
        (d) => d.doc_kind === "quotation" && d.extraction_status === "ready",
      ),
    [docs.data],
  );

  const mutation = useMutation({ mutationFn: () => compare({ data: { documentIds: selected } }) });
  const result = mutation.data?.ok ? (mutation.data.comparison as unknown as Comparison) : null;

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= 6 ? s : [...s, id],
    );

  return (
    <div>
      <PageHeader
        title="Supplier Quotation Comparison"
        description="Pick two to six quotations read by the Document Reader. Prices, GST, terms and your previous purchase rates are compared side by side."
        actions={
          <Button
            onClick={() => mutation.mutate()}
            disabled={selected.length < 2 || mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <GitCompare className="mr-1.5 h-4 w-4" />
            )}
            Compare {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
        }
      />

      <PageBody>
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quotations available</CardTitle>
            </CardHeader>
            <CardContent>
              {docs.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {!docs.isPending && quotes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No quotations yet. Upload supplier quotations in the Document Reader with type
                  "Quotation".
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {quotes.map((q) => (
                  <label
                    key={q.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selected.includes(q.id)}
                      onCheckedChange={() => toggle(q.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{q.suppliers?.name ?? q.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{q.title}</p>
                      {q.quotation_group && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {q.quotation_group}
                        </Badge>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {mutation.data && !mutation.data.ok && (
            <p className="text-sm text-destructive">{mutation.data.error}</p>
          )}
          {mutation.isError && (
            <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
          )}

          {result && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Terms</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Quoted total</TableHead>
                        <TableHead>Delivery</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Validity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.suppliers.map((s) => (
                        <TableRow key={s.supplier}>
                          <TableCell className="font-medium">{s.supplier}</TableCell>
                          <TableCell>{s.total != null ? inr(s.total) : "—"}</TableCell>
                          <TableCell>{s.deliveryTerms ?? "—"}</TableCell>
                          <TableCell>{s.paymentTerms ?? "—"}</TableCell>
                          <TableCell>{s.validity ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Material by material</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Previous rate</TableHead>
                        {result.suppliers.map((s) => (
                          <TableHead key={s.supplier}>{s.supplier}</TableHead>
                        ))}
                        <TableHead>Best</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.materials.map((m) => (
                        <TableRow key={m.material}>
                          <TableCell className="font-medium">
                            {m.material}
                            {m.unit ? (
                              <span className="text-xs text-muted-foreground"> / {m.unit}</span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {m.previousRate != null ? inr(m.previousRate) : "—"}
                          </TableCell>
                          {result.suppliers.map((s) => {
                            const o = m.offers.find((x) => x.supplier === s.supplier);
                            const best = m.bestSupplier === s.supplier;
                            return (
                              <TableCell
                                key={s.supplier}
                                className={best ? "font-semibold text-primary" : ""}
                              >
                                {o?.rate != null ? inr(o.rate) : "—"}
                                {o?.gstPct != null ? (
                                  <span className="text-xs text-muted-foreground">
                                    {" "}
                                    +{o.gstPct}%
                                  </span>
                                ) : null}
                              </TableCell>
                            );
                          })}
                          <TableCell>{m.bestSupplier ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {result.analysis && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      AI analysis{" "}
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Interpretation
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Markdown>{result.analysis}</Markdown>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </PageBody>
    </div>
  );
}
