import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  BookOpen, ListTree, FileEdit, CalendarDays, Scale,
  TrendingUp, ClipboardList,
} from "lucide-react";

export const Route = createFileRoute("/_app/accounting")({
  component: AccountingHome,
});

const TILES = [
  { to: "/accounting/ledgers", label: "Chart of Accounts", desc: "Ledger groups & accounts", Icon: ListTree },
  { to: "/accounting/day-book", label: "Day Book", desc: "All vouchers, chronological", Icon: CalendarDays },
  { to: "/accounting/vouchers/new", label: "New Voucher", desc: "Journal, receipt, payment, contra", Icon: FileEdit },
  { to: "/accounting/trial-balance", label: "Trial Balance", desc: "All ledger balances", Icon: Scale },
  { to: "/accounting/profit-loss", label: "Profit & Loss", desc: "Income vs expenses", Icon: TrendingUp },
  { to: "/accounting/balance-sheet", label: "Balance Sheet", desc: "Assets vs liabilities", Icon: ClipboardList },
] as const;

function AccountingHome() {
  return (
    <>
      <PageHeader
        title="Accounting"
        description="Double-entry general ledger. Every invoice, bill, and payslip posts here automatically."
      />
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
                      <BookOpen className="h-3.5 w-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
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
