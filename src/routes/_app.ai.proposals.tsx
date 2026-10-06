import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { listAiAuditLog, listAiProposals, reviewAiProposal } from "@/lib/ai.functions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/ai/proposals")({ component: ProposalsPage });

function ProposalsPage() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const list = useServerFn(listAiProposals);
  const review = useServerFn(reviewAiProposal);
  const audit = useServerFn(listAiAuditLog);

  const proposals = useQuery({ queryKey: ["ai-proposals"], queryFn: () => list() });
  const log = useQuery({ queryKey: ["ai-audit"], queryFn: () => audit(), enabled: isAdmin });

  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected" }) => review({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.decision === "approved" ? "Proposal approved — complete it in the normal ERP screen." : "Proposal rejected");
      qc.invalidateQueries({ queryKey: ["ai-proposals"] });
      qc.invalidateQueries({ queryKey: ["ai-audit"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="AI Proposals & Audit"
        description="Every change the AI suggests waits here for a human decision. Approving records the decision; the actual ERP entry is still made through the normal screen with its usual checks."
      />

      <PageBody>
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" /> Proposals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {proposals.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {proposals.data && proposals.data.length === 0 && (
                <p className="text-sm text-muted-foreground">No proposals yet. They appear when you accept an AI suggestion from a document or analysis.</p>
              )}
              {proposals.data && proposals.data.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kind</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {proposals.data.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="capitalize">{p.kind.replace(/_/g, " ")}</TableCell>
                          <TableCell className="max-w-[360px]">
                            <p className="text-sm">{p.summary}</p>
                            {p.review_note && <p className="text-xs text-muted-foreground">Note: {p.review_note}</p>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={p.status === "approved" ? "secondary" : p.status === "rejected" ? "destructive" : "outline"} className="capitalize">
                              {p.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(p.created_at)}</TableCell>
                          <TableCell className="text-right">
                            {isAdmin && p.status === "pending" && (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: p.id, decision: "approved" })} disabled={decide.isPending}>
                                  <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: p.id, decision: "rejected" })} disabled={decide.isPending}>
                                  <XCircle className="mr-1 h-4 w-4" /> Reject
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">AI activity log</CardTitle>
              </CardHeader>
              <CardContent>
                {log.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {log.data && log.data.length === 0 && <p className="text-sm text-muted-foreground">No AI activity recorded yet.</p>}
                {log.data && log.data.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Feature</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Model</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Summary</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {log.data.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-nowrap">{formatDate(row.created_at)}</TableCell>
                            <TableCell>{row.feature}</TableCell>
                            <TableCell>{row.action ?? "—"}</TableCell>
                            <TableCell className="max-w-[160px] truncate text-xs">{row.model ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={row.status === "error" ? "destructive" : "secondary"} title={row.error ?? undefined}>
                                {row.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{row.duration_ms != null ? `${(row.duration_ms / 1000).toFixed(1)}s` : "—"}</TableCell>
                            <TableCell className="max-w-[280px] truncate text-xs">{row.prompt_summary ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PageBody>
    </div>
  );
}
