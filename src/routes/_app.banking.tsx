import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Landmark, ArrowLeftRight, FileCheck, Banknote, Globe2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_app/banking")({ component: BankingLayout });

function BankingLayout() {
  const loc = useLocation();
  const atRoot = loc.pathname === "/banking" || loc.pathname === "/banking/";
  if (!atRoot) return <Outlet />;

  const tiles = [
    { to: "/banking/accounts", label: "Bank Accounts", icon: Landmark, desc: "Bank account master & opening balances" },
    { to: "/banking/reconcile", label: "Reconciliation", icon: ArrowLeftRight, desc: "Match book entries with bank statement" },
    { to: "/banking/cheques", label: "Cheque Register", icon: FileCheck, desc: "Issued & received cheques with status" },
    { to: "/banking/payment-advice", label: "Payment Advice", icon: Banknote, desc: "Generate printable payment advice" },
    { to: "/banking/currencies", label: "Currencies & Rates", icon: Globe2, desc: "Multi-currency exchange rates" },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Banking" description="Bank accounts, reconciliation, cheques & multi-currency" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} className="glass p-5 rounded-2xl hover:translate-y-[-2px] transition-all group">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-xl btn-gold flex items-center justify-center"><Icon className="h-5 w-5" /></div>
                <div className="font-semibold gold-text">{t.label}</div>
              </div>
              <div className="text-sm text-muted-foreground">{t.desc}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
