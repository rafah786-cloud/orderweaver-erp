import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { sb, type LedgerBalance, type LedgerGroup } from "@/lib/accounting";
import { inr } from "@/lib/format";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/accounting/ledgers")({
  component: LedgersPage,
});

function LedgersPage() {
  const [search, setSearch] = useState("");

  const groupsQ = useQuery({
    queryKey: ["ledger_groups"],
    queryFn: async () => {
      const { data, error } = await sb.from("ledger_groups").select("*").order("name");
      if (error) throw error;
      return data as LedgerGroup[];
    },
  });

  const balancesQ = useQuery({
    queryKey: ["ledger_balances"],
    queryFn: async () => {
      const { data, error } = await sb.from("ledger_balances").select("*").order("name");
      if (error) throw error;
      return data as LedgerBalance[];
    },
  });

  const filtered = useMemo(() => {
    const all = balancesQ.data ?? [];
    if (!search.trim()) return all;
    const s = search.toLowerCase();
    return all.filter(
      (l) => l.name.toLowerCase().includes(s) || l.group_name.toLowerCase().includes(s),
    );
  }, [balancesQ.data, search]);

  const byGroup = useMemo(() => {
    const map = new Map<string, LedgerBalance[]>();
    for (const l of filtered) {
      const arr = map.get(l.group_name) ?? [];
      arr.push(l);
      map.set(l.group_name, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <>
      <PageHeader
        title="Chart of Accounts"
        description={`${groupsQ.data?.length ?? 0} groups · ${balancesQ.data?.length ?? 0} ledgers`}
      />
      <PageBody>
        <div className="mb-4 max-w-md">
          <Input
            placeholder="Search ledger or group..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="space-y-4">
          {byGroup.map(([groupName, ledgers]) => (
            <Card key={groupName}>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b bg-muted/30 font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                  {groupName}
                </div>
                <div className="divide-y">
                  {ledgers.map((l) => {
                    const bal = Math.abs(l.closing_balance);
                    const drCr = l.closing_balance >= 0 ? "Dr" : "Cr";
                    return (
                      <Link
                        key={l.ledger_id}
                        to="/accounting/ledger/$id"
                        params={{ id: l.ledger_id }}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{l.name}</span>
                        </div>
                        <div className="text-sm tabular-nums">
                          {inr(bal)}{" "}
                          <span className="text-xs text-muted-foreground ml-1">{drCr}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
          {byGroup.length === 0 && !balancesQ.isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">No ledgers match.</p>
          )}
        </div>
      </PageBody>
    </>
  );
}
