import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { FileSpreadsheet, ListChecks, Hash, QrCode, ShieldAlert } from "lucide-react";
import { useCompany } from "@/lib/company-context";

export const Route = createFileRoute("/_app/gst")({
  head: () => ({
    meta: [
      { title: "GST Compliance | Mattress Maestro ERP" },
      { name: "description", content: "Returns, HSN codes, and e-invoicing." },
    ],
  }),
  component: GstLayout,
});

const TILES = [
  {
    to: "/gst/returns",
    label: "GST Returns",
    desc: "GSTR-1, GSTR-3B, GSTR-9",
    Icon: FileSpreadsheet,
  },
  { to: "/gst/hsn", label: "HSN / SAC Codes", desc: "Code master with default rates", Icon: Hash },
  { to: "/gst/einvoices", label: "E-Invoices", desc: "IRN registry & QR codes", Icon: QrCode },
] as const;

function GstLayout() {
  const loc = useLocation();
  const { activeCompany } = useCompany();
  const managementBook = activeCompany?.code.endsWith("_MGMT") ?? false;
  const isIndex = loc.pathname === "/gst" || loc.pathname === "/gst/";

  if (managementBook) {
    return (
      <PageBody className="flex min-h-[70vh] items-center justify-center">
        <Card className="w-full max-w-2xl border-amber-200 bg-amber-50">
          <CardContent className="p-6 sm:p-8">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-amber-950">
                  GST compliance is disabled for this book
                </h1>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  You are viewing an internal management book. Use the official company book for
                  statutory GST returns, HSN/SAC reporting and e-invoices. Management books must not
                  be used to omit, replace or reclassify taxable statutory transactions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </PageBody>
    );
  }

  if (!isIndex) return <Outlet />;

  return (
    <>
      <PageHeader
        title="GST Compliance"
        description="File returns, manage HSN codes, generate e-invoices."
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map(({ to, label, desc, Icon }) => (
            <Link key={to} to={to} className="group">
              <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-lg">
                <CardContent className="flex items-start gap-4 p-6">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl btn-gold">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-base font-semibold">
                      {label}
                      <ListChecks
                        className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-50"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{desc}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
