import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPartyMessages, retryNotificationLog } from "@/lib/notifications-admin.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export function PartyMessagesDialog({
  open,
  onOpenChange,
  party_kind,
  party_id,
  party_name,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  party_kind: "customer" | "vendor";
  party_id: string | null;
  party_name: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPartyMessages);
  const retryFn = useServerFn(retryNotificationLog);
  const key = ["party-messages", party_kind, party_id];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: open && !!party_id,
    queryFn: () => listFn({ data: { party_kind, party_id: party_id!, limit: 100 } }),
  });
  const retry = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success("Message resent");
      else toast.error(`Retry skipped: ${r?.reason ?? "unknown"}`);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["wa-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = (data?.rows ?? []) as any[];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Message history — {party_name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Read</TableHead>
                <TableHead>Failure</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    No messages yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {format(new Date(r.sent_at), "yyyy-MM-dd HH:mm")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.event_type}</TableCell>
                    <TableCell className="text-xs">{r.template_name ?? "—"}</TableCell>
                    <TableCell>
                      {r.status === "sent" ? (
                        <Badge>Sent</Badge>
                      ) : r.status === "failed" ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : (
                        <Badge variant="secondary">Skipped</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.read_status === "read" ? (
                        <Badge>Read</Badge>
                      ) : r.read_status === "delivered" ? (
                        <Badge variant="secondary">Delivered</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-xs text-destructive max-w-[200px] truncate"
                      title={r.failure_reason ?? ""}
                    >
                      {r.failure_reason ?? ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status !== "sent" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(r.id)}
                        >
                          <RotateCw className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
