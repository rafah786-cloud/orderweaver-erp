import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listWhatsAppLogs,
  listCustomersForFilter,
  listVendorsForFilter,
} from "@/lib/whatsapp-admin.functions";
import { retryNotificationLog } from "@/lib/notifications-admin.functions";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, FileText, RotateCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";


export const Route = createFileRoute("/_app/communications/whatsapp-logs")({
  component: WhatsAppLogsPage,
});

type Row = {
  id: string;
  sent_at: string;
  party_kind: string;
  party_id: string | null;
  recipient_name: string;
  recipient_phone: string | null;
  event_type: string;
  template_name: string | null;
  status: string;
  read_status: string | null;
  failure_reason: string | null;
  whatsapp_message_id: string | null;
};

function statusBadge(s: string) {
  if (s === "sent") return <Badge>Sent</Badge>;
  if (s === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="secondary">Skipped</Badge>;
}

function readBadge(s: string | null) {
  if (!s || s === "unknown") return <span className="text-muted-foreground text-xs">—</span>;
  if (s === "read") return <Badge variant="default">Read</Badge>;
  if (s === "delivered") return <Badge variant="secondary">Delivered</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function WhatsAppLogsPage() {
  const qc = useQueryClient();
  const listLogsFn = useServerFn(listWhatsAppLogs);
  const listCustomersFn = useServerFn(listCustomersForFilter);
  const listVendorsFn = useServerFn(listVendorsForFilter);
  const retryFn = useServerFn(retryNotificationLog);

  const retry = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success("Message resent");
      else toast.error(`Retry skipped: ${r?.reason ?? "unknown"}`);
      qc.invalidateQueries({ queryKey: ["wa-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const monthAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return format(d, "yyyy-MM-dd");
  }, []);

  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [partyKind, setPartyKind] = useState<string>("all");
  const [customerId, setCustomerId] = useState<string>("all");
  const [vendorId, setVendorId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: customers } = useQuery({ queryKey: ["wa-flt-customers"], queryFn: () => listCustomersFn() });
  const { data: vendors } = useQuery({ queryKey: ["wa-flt-vendors"], queryFn: () => listVendorsFn() });

  const partyId =
    partyKind === "customer" && customerId !== "all" ? customerId :
    partyKind === "vendor" && vendorId !== "all" ? vendorId :
    undefined;

  const filters = {
    from: from ? new Date(from + "T00:00:00").toISOString() : undefined,
    to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
    party_kind: partyKind !== "all" ? (partyKind as any) : undefined,
    party_id: partyId,
    status: status !== "all" ? (status as any) : undefined,
    search: search.trim() || undefined,
    limit: 1000,
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["wa-logs", filters],
    queryFn: () => listLogsFn({ data: filters }),
  });

  const rows: Row[] = (data?.rows ?? []) as any;

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        Date: format(new Date(r.sent_at), "yyyy-MM-dd HH:mm"),
        Recipient: r.recipient_name,
        Type: r.party_kind,
        Mobile: r.recipient_phone ?? "",
        Event: r.event_type,
        Template: r.template_name ?? "",
        "Delivery Status": r.status,
        "Read Status": r.read_status ?? "",
        "Failure Reason": r.failure_reason ?? "",
        "Message ID": r.whatsapp_message_id ?? "",
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "WhatsApp Logs");
    XLSX.writeFile(wb, `whatsapp-logs-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`);
  }

  async function exportPDF() {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("WhatsApp Notification Logs", 14, 14);
    doc.setFontSize(9);
    doc.text(`Range: ${from} to ${to}`, 14, 20);
    autoTable(doc, {
      startY: 24,
      head: [["Date", "Recipient", "Mobile", "Event", "Template", "Status", "Read", "Failure"]],
      body: rows.map((r) => [
        format(new Date(r.sent_at), "yyyy-MM-dd HH:mm"),
        r.recipient_name,
        r.recipient_phone ?? "",
        r.event_type,
        r.template_name ?? "",
        r.status,
        r.read_status ?? "",
        (r.failure_reason ?? "").slice(0, 60),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    doc.save(`whatsapp-logs-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
  }

  return (
    <>
      <PageHeader
        title="WhatsApp Logs"
        description="Delivery, read receipts, and failure reasons for every WhatsApp message sent by the system."
      />
      <PageBody>
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-7">
              <div className="space-y-1">
                <Label>From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Recipient type</Label>
                <Select value={partyKind} onValueChange={setPartyKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {partyKind === "customer" && (
                <div className="space-y-1">
                  <Label>Customer</Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {(customers?.customers ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {partyKind === "vendor" && (
                <div className="space-y-1">
                  <Label>Vendor</Label>
                  <Select value={vendorId} onValueChange={setVendorId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {(vendors?.vendors ?? []).map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Phone search</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="+9198…" />
              </div>
              <div className="flex items-end">
                <Button variant="outline" className="w-full" onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? "Refreshing…" : "Apply"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {rows.length} message{rows.length === 1 ? "" : "s"}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={rows.length === 0}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportPDF} disabled={rows.length === 0}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Read</TableHead>
                    <TableHead>Failure reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No messages match the current filters.</TableCell></TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.sent_at), "yyyy-MM-dd HH:mm")}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.recipient_name}</div>
                          <div className="text-xs text-muted-foreground">{r.party_kind}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.recipient_phone ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.event_type}</TableCell>
                        <TableCell className="text-xs">{r.template_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell>{readBadge(r.read_status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={r.failure_reason ?? ""}>
                          {r.failure_reason ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
              <Download className="h-3 w-3" /> Exports include all currently filtered rows (up to 1000).
            </p>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
