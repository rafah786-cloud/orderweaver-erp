import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sb } from "@/lib/accounting";
import { useState } from "react";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_app/accounting/audit-log")({
  component: AuditLogPage,
});

type AuditRow = {
  id: string;
  voucher_id: string | null;
  entry_id: string | null;
  table_name: string;
  action: string;
  changed_by: string | null;
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

const actionColor: Record<string, string> = {
  INSERT: "bg-green-500/10 text-green-700 dark:text-green-400",
  UPDATE: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  DELETE: "bg-destructive/10 text-destructive",
};

function AuditLogPage() {
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["voucher_audit_log"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("voucher_audit_log")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as AuditRow[];
    },
  });

  const filtered = (q.data ?? []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.action.toLowerCase().includes(s) ||
      r.table_name.toLowerCase().includes(s) ||
      (r.voucher_id ?? "").includes(s)
    );
  });

  return (
    <>
      <PageHeader
        title="Audit Trail"
        description="Every voucher and entry change is recorded here."
      />
      <PageBody>
        <Card>
          <CardContent className="p-4">
            <Input
              placeholder="Filter by action, table, or voucher id…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3">When</th>
                    <th className="p-3">Table</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Voucher</th>
                    <th className="p-3">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const data = r.new_data ?? r.old_data ?? {};
                    const vnum = (data as { voucher_number?: string }).voucher_number;
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="p-3 whitespace-nowrap">
                          {format(new Date(r.changed_at), "dd MMM yyyy HH:mm:ss")}
                        </td>
                        <td className="p-3">{r.table_name}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${actionColor[r.action] ?? "bg-muted"}`}
                          >
                            {r.action}
                          </span>
                        </td>
                        <td className="p-3">
                          {r.voucher_id ? (
                            <Link
                              to="/accounting/voucher/$id"
                              params={{ id: r.voucher_id }}
                              className="text-primary inline-flex items-center gap-1 hover:underline"
                            >
                              {vnum ?? r.voucher_id.slice(0, 8)}{" "}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground max-w-md truncate">
                          {r.action === "UPDATE" && r.old_data && r.new_data
                            ? diffSummary(r.old_data, r.new_data)
                            : JSON.stringify(data).slice(0, 120)}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                        No audit entries.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

function diffSummary(oldD: Record<string, unknown>, newD: Record<string, unknown>): string {
  const changes: string[] = [];
  for (const k of Object.keys(newD)) {
    if (JSON.stringify(oldD[k]) !== JSON.stringify(newD[k])) {
      changes.push(`${k}: ${JSON.stringify(oldD[k])} → ${JSON.stringify(newD[k])}`);
    }
  }
  return changes.slice(0, 3).join("; ") || "no field diff";
}
