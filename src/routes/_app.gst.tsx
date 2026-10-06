import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { FileSpreadsheet, ListChecks, Hash, QrCode } from "lucide-react";

export const Route = createFileRoute("/_app/gst")({
  component: GstLayout,
});

const TILES = [
  { to: "/gst/returns", label: "GST Returns", desc: "GSTR-1, GSTR-3B, GSTR-9", Icon: FileSpreadsheet },
  { to: "/gst/hsn", label: "HSN / SAC Codes", desc: "Code master with default rates", Icon: Hash },
  { to: "/gst/einvoices", label: "E-Invoices", desc: "IRN registry & QR codes", Icon: QrCode },
] as const;

function GstLayout() {
  const loc = useLocation();
  const isIndex = loc.pathname === "/gst" || loc.pathname === "/gst/";
  if (!isIndex) return <Outlet />;
  return (
    <>
      <PageHeader title="GST Compliance" description="File returns, manage HSN codes, generate e-invoices." />
      <PageBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TILES.map(({ to, label, desc, Icon }) => (
            <Link key={to} to={to} className="group">
              <Card className="h-full transition-all group-hover:shadow-lg group-hover:-translate-y-0.5">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl btn-gold flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-base flex items-center gap-2">
                      {label}
                      <ListChecks className="h-3.5 w-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{desc}</div>
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
