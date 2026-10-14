import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { FileText, ShoppingCart, Users, Printer, ExternalLink } from "lucide-react";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/print")({
  component: PrintRoute,
});

function PrintRoute() {
  const { pathname } = useLocation();
  const isHub = pathname.replace(/\/$/, "") === "/print";

  return (
    <>
      {isHub && <PrintHub />}
      <Outlet />
    </>
  );
}

function PrintHub() {
  return (
    <>
      <PageHeader
        title="Document Printing"
        description="Open a business document, preview its print layout, then send it to an installed printer or save it as PDF."
      />
      <PageBody>
        <div className="mb-5 flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <Printer className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">Printing uses the Windows/browser print dialog.</p>
            <p className="mt-1 text-muted-foreground">
              Choose your installed printer or “Save as PDF” from the print dialog. Product-label design and printing are managed in Smart Label Creator, not this ERP screen.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle>Sales invoices</CardTitle>
              <CardDescription>Open an invoice and use its Print preview action to select the invoice layout.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/invoices">Open invoices <ExternalLink className="ml-2 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <ShoppingCart className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle>Purchase documents</CardTitle>
              <CardDescription>Print purchase bills or supplier statements from the Purchases workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/purchases">Open purchases <ExternalLink className="ml-2 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle>Customer statements</CardTitle>
              <CardDescription>Open a customer account and use Print preview to produce a dated ledger statement.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/parties">Open parties <ExternalLink className="ml-2 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
