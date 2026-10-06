import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { sb, type BankAccount } from "@/lib/banking";
import { PageHeader } from "@/components/PageHeader";
import { Landmark } from "lucide-react";

export const Route = createFileRoute("/_app/banking/reconcile")({ component: ReconcileIndex });

function ReconcileIndex() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  useEffect(() => { sb.from("bank_accounts").select("*").eq("is_active", true).order("name").then(({ data }: { data: any }) => setAccounts(data ?? [])); }, []);
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Bank Reconciliation" description="Select an account to reconcile" />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Link key={a.id} to="/banking/reconcile/$id" params={{ id: a.id }} className="glass rounded-2xl p-4 hover:translate-y-[-2px] transition-all">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl btn-gold flex items-center justify-center"><Landmark className="h-5 w-5" /></div>
              <div>
                <div className="font-semibold">{a.name}</div>
                <div className="text-xs text-muted-foreground">{a.bank_name} · {a.account_number}</div>
              </div>
            </div>
          </Link>
        ))}
        {accounts.length === 0 && <div className="text-muted-foreground">No bank accounts. Create one first.</div>}
      </div>
    </div>
  );
}
