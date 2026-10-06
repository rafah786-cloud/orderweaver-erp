import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sb } from "@/lib/accounting";
import { formatDate, inr } from "@/lib/format";
import { QrCode, ExternalLink, ShieldAlert } from "lucide-react";
import { useCompany } from "@/lib/company-context";

export const Route = createFileRoute("/_app/gst/einvoices")({
  component: EInvoicesPage,
});

type EInvoice = {
  id: string;
  invoice_id: string;
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  signed_qr: string | null;
  status: string;
  created_at: string;
};

function EInvoicesPage() {
  const { activeCompany } = useCompany();
  const managementBook = activeCompany?.code.endsWith("_MGMT") ?? false;

  const q = useQuery({
    queryKey: ["einvoices", activeCompany?.id],
    enabled: !managementBook && !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("e_invoices")
        .select("*,invoices(invoice_number,invoice_date,total_amount)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as (EInvoice & {
        invoices: { invoice_number: string; invoice_date: string; total_amount: number } | null;
      })[];
    },
  });

  if (managementBook) {
    return (
      <>
        <PageHeader title="E-Invoices" description="Official GST e-invoice registry." />
        <PageBody className="flex min-h-[65vh] items-center justify-center">
          <Card className="w-full max-w-2xl border-amber-200 bg-amber-50">
            <CardContent className="p-6 sm:p-8">
              <div className="flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                  <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-amber-950">
                    Not available in the internal management book
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-amber-900">
                    Switch to the corresponding official company book for GST e-invoice work.
                    Internal management books are for analysis only.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="E-Invoices"
        description="IRN registry for invoices successfully registered through a live GST IRP integration."
      />
      <PageBody>
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-950">
            <div className="font-semibold">Live IRP integration required</div>
            <p className="mt-1 leading-6">
              This ERP does not currently have a live GST Invoice Registration Portal connection.
              IRNs, acknowledgement numbers and signed QR payloads must come from the official IRP
              response and must never be fabricated locally. The Generate IRN action is therefore
              intentionally disabled until the integration is live and tested.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Invoice</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>IRN</TableHead>
                  <TableHead className="w-36">Ack No.</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Loading e-invoice registry…
                    </TableCell>
                  </TableRow>
                ) : q.isError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-destructive">
                      Could not load the e-invoice registry. Refresh and try again.
                    </TableCell>
                  </TableRow>
                ) : q.data?.length ? (
                  q.data.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">
                        {e.invoices?.invoice_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {e.invoices?.invoice_date ? formatDate(e.invoices.invoice_date) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate font-mono text-xs">
                        {e.irn ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{e.ack_no ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={e.status === "cancelled" ? "destructive" : "secondary"}>
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {e.invoices?.total_amount != null ? inr(e.invoices.total_amount) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {e.invoices?.invoice_number ? (
                          <Link to="/invoices">
                            <Button variant="ghost" size="sm" aria-label="Open invoices">
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </Link>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      <QrCode className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
                      No live e-invoices registered yet.
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
