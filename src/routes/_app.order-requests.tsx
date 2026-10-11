import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, ClipboardList, Plus, RefreshCw, CheckCircle2 } from "lucide-react";
import { createSalesOrderRequest, convertSalesOrderRequest } from "@/lib/order-requests.functions";
import { createLabelHandoff } from "@/lib/label-handoff.functions";
import { notifyStaffEvent } from "@/lib/staff-notifications.functions";

export const Route = createFileRoute("/_app/order-requests")({ component: OrderRequestsPage });

type ProductModel = {
  id: string; name: string; size: string | null; default_price: number; label_product_kind: string;
};
type Customer = { id: string; name: string };
type RequestLine = {
  id: string; model_id: string; product_name: string; size: string | null;
  quantity: number; suggested_unit_price: number;
};
type OrderRequest = {
  id: string; request_number: string; party_id: string; status: string; requested_delivery: string | null;
  notes: string | null; created_by: string; created_at: string; converted_sales_order_id: string | null;
  parties: { name: string } | { name: string }[] | null;
  sales_order_request_items: RequestLine[];
};
type LabelPrompt = { id: string; orderNumber: string };

function OrderRequestsPage() {
  const { hasAnyRole } = useAuth();
  const canSubmit = hasAnyRole(["admin", "sales"]);
  const canConvert = hasAnyRole(["admin", "accountant"]);
  const qc = useQueryClient();
  const createRequestFn = useServerFn(createSalesOrderRequest);
  const convertRequestFn = useServerFn(convertSalesOrderRequest);
  const createHandoffFn = useServerFn(createLabelHandoff);
  const notifyStaffFn = useServerFn(notifyStaffEvent);

  const [createOpen, setCreateOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<OrderRequest | null>(null);
  const [labelPrompt, setLabelPrompt] = useState<LabelPrompt | null>(null);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelLink, setLabelLink] = useState<{ url: string; count: number; excluded: number } | null>(null);

  const emptyCreateForm = () => ({
    party_id: "",
    requested_delivery: "",
    notes: "",
    idempotency_key: crypto.randomUUID(),
    lines: [{ model_id: "", quantity: 1 }],
  });
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [convertForm, setConvertForm] = useState({
    order_date: new Date().toISOString().slice(0, 10),
    expected_delivery: "",
    notes: "",
    idempotency_key: crypto.randomUUID(),
    prices: {} as Record<string, string>,
  });

  const customersQuery = useQuery({
    queryKey: ["order-request-customers"],
    enabled: createOpen,
    queryFn: async () => {
      const db: any = supabase;
      const { data, error } = await db.from("parties").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const modelsQuery = useQuery({
    queryKey: ["order-request-models"],
    enabled: createOpen,
    queryFn: async () => {
      const db: any = supabase;
      const { data, error } = await db.from("product_models")
        .select("id,name,size,default_price,label_product_kind").order("name");
      if (error) throw error;
      return (data ?? []) as ProductModel[];
    },
  });

  const requestsQuery = useQuery({
    queryKey: ["sales-order-requests"],
    queryFn: async () => {
      const db: any = supabase;
      const { data, error } = await db.from("sales_order_requests")
        .select("id,request_number,party_id,status,requested_delivery,notes,created_by,created_at,converted_sales_order_id,parties(name),sales_order_request_items(id,model_id,product_name,size,quantity,suggested_unit_price)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderRequest[];
    },
  });

  const createRequest = useMutation({
    mutationFn: () => {
      if (!createForm.party_id) throw new Error("Select a customer.");
      if (!createForm.lines.length || createForm.lines.some((line) => !line.model_id || !Number.isFinite(line.quantity) || line.quantity <= 0)) {
        throw new Error("Select a product model and a positive quantity for every line.");
      }
      return createRequestFn({
        data: {
          party_id: createForm.party_id,
          requested_delivery: createForm.requested_delivery || null,
          notes: createForm.notes || null,
          idempotency_key: createForm.idempotency_key,
          lines: createForm.lines.map((line) => ({ model_id: line.model_id, quantity: line.quantity })),
        },
      });
    },
    onSuccess: (request) => {
      toast.success("Customer order request submitted", { description: request.request_number + " sent to Accounts." });
      void qc.invalidateQueries({ queryKey: ["sales-order-requests"] });
      setCreateOpen(false);
      setCreateForm(emptyCreateForm());
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startConversion = (request: OrderRequest) => {
    setSelectedRequest(request);
    setConvertForm({
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery: request.requested_delivery ?? "",
      notes: request.notes ?? "",
      idempotency_key: crypto.randomUUID(),
      prices: Object.fromEntries((request.sales_order_request_items ?? []).map((line) => [line.id, String(line.suggested_unit_price ?? 0)])),
    });
    setConvertOpen(true);
  };

  const convertRequest = useMutation({
    mutationFn: () => {
      if (!selectedRequest) throw new Error("Choose a request first.");
      const lines = selectedRequest.sales_order_request_items ?? [];
      const prices = lines.map((line) => ({
        request_line_id: line.id,
        unit_price: Number(convertForm.prices[line.id]),
      }));
      if (prices.some((p) => !Number.isFinite(p.unit_price) || p.unit_price < 0)) {
        throw new Error("Each line must have a valid non-negative unit price.");
      }
      return convertRequestFn({
        data: {
          request_id: selectedRequest.id,
          order_date: convertForm.order_date,
          expected_delivery: convertForm.expected_delivery || null,
          notes: convertForm.notes || null,
          idempotency_key: convertForm.idempotency_key,
          prices,
        },
      });
    },
    onSuccess: (result) => {
      toast.success("Sales Order saved", { description: result.order_number + " created from the customer request." });
      void qc.invalidateQueries({ queryKey: ["sales-order-requests"] });
      void qc.invalidateQueries({ queryKey: ["sales-orders"] });
      void qc.invalidateQueries({ queryKey: ["production-orders"] });
      setConvertOpen(false);
      setSelectedRequest(null);
      setLabelLink(null);
      setLabelPrompt({ id: result.id, orderNumber: result.order_number });
      void notifyStaffFn({ data: { event: "staff.sales_order.created", ref_id: result.id } }).catch(() => {
        // The transactional production alert and print queue are already written with the order.
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const summaries = useMemo(() => {
    const rows = requestsQuery.data ?? [];
    return {
      submitted: rows.filter((row) => row.status === "submitted").length,
      converted: rows.filter((row) => row.status === "converted").length,
    };
  }, [requestsQuery.data]);

  const openLabelHandoff = async () => {
    if (!labelPrompt) return;
    setLabelBusy(true);
    setLabelLink(null);
    const popup = window.open("about:blank", "_blank");
    try {
      const result = await createHandoffFn({ data: { sales_order_id: labelPrompt.id } });
      setLabelLink({ url: result.url, count: result.label_count, excluded: result.excluded_lines });
      if (popup) {
        popup.location.replace(result.url);
      } else {
        toast.info("Label batch prepared", { description: "Use the Open Smart Label Creator link in this dialog; the browser blocked the pop-up." });
      }
    } catch (error) {
      popup?.close();
      toast.error(error instanceof Error ? error.message : "Could not prepare label data.");
    } finally {
      setLabelBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Customer Order Requests"
        description="Sales submits requested items from mobile; Accounts reviews the request and converts it into a saved Sales Order."
        actions={canSubmit ? (
          <Button onClick={() => { setCreateForm(emptyCreateForm()); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> New Request
          </Button>
        ) : undefined}
      />
      <PageBody>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Waiting for Accounts</div><div className="mt-1 text-2xl font-semibold">{summaries.submitted}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Converted to Sales Orders</div><div className="mt-1 text-2xl font-semibold">{summaries.converted}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Submission safety</div><div className="mt-1 text-sm">Request submission does not reserve stock or create a Sales Order.</div></CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /><h2 className="font-semibold">Requests</h2></div>
              <Button variant="outline" size="sm" onClick={() => void requestsQuery.refetch()} disabled={requestsQuery.isFetching}>
                <RefreshCw className={"mr-2 h-3.5 w-3.5 " + (requestsQuery.isFetching ? "animate-spin" : "")} /> Refresh
              </Button>
            </div>
            {requestsQuery.isError ? (
              <div className="p-6 text-sm text-destructive">Could not load requests. Check your company access and try Refresh.</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Request</TableHead><TableHead>Customer</TableHead><TableHead>Items</TableHead>
                  <TableHead>Requested delivery</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {requestsQuery.isLoading ? (
                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Loading requests…</TableCell></TableRow>
                  ) : (requestsQuery.data ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No order requests yet.</TableCell></TableRow>
                  ) : (requestsQuery.data ?? []).map((request) => {
                    const party = Array.isArray(request.parties) ? request.parties[0] : request.parties;
                    const lines = request.sales_order_request_items ?? [];
                    return (
                      <TableRow key={request.id}>
                        <TableCell><div className="font-medium">{request.request_number}</div><div className="text-xs text-muted-foreground">{new Date(request.created_at).toLocaleString()}</div></TableCell>
                        <TableCell>{party?.name ?? "Customer"}</TableCell>
                        <TableCell className="min-w-48">
                          <div className="space-y-1">{lines.map((line) => <div key={line.id} className="text-sm">{line.product_name}{line.size ? " · " + line.size : ""} <span className="font-medium">× {Number(line.quantity).toLocaleString("en-IN")}</span></div>)}</div>
                        </TableCell>
                        <TableCell>{request.requested_delivery ?? "—"}</TableCell>
                        <TableCell>
                          {request.status === "submitted" ? <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"><AlertTriangle className="h-3 w-3" /> Waiting</span>
                            : request.status === "converted" ? <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"><CheckCircle2 className="h-3 w-3" /> Converted</span>
                            : <span className="rounded-full border px-2 py-1 text-xs capitalize">{request.status}</span>}
                          {request.converted_sales_order_id && <div className="mt-1 text-xs text-muted-foreground">Sales Order saved</div>}
                        </TableCell>
                        <TableCell className="text-right">
                          {canConvert && request.status === "submitted" && (
                            <Button size="sm" onClick={() => startConversion(request)}>Generate Sales Order</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </PageBody>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!createRequest.isPending) setCreateOpen(open); }}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Customer Order Request</DialogTitle>
            <DialogDescription>This submits a request for Accounts to review. It does not create a Sales Order or reserve stock.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Customer *</Label>
              <Select value={createForm.party_id || undefined} onValueChange={(party_id) => setCreateForm((prev) => ({ ...prev, party_id }))}>
                <SelectTrigger><SelectValue placeholder={customersQuery.isLoading ? "Loading customers…" : "Select customer"} /></SelectTrigger>
                <SelectContent>{(customersQuery.data ?? []).map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent>
              </Select>
              {customersQuery.isError && <p className="text-xs text-destructive">Customers could not be loaded.</p>}
            </div>
            <div className="space-y-1.5"><Label>Requested delivery date</Label><Input type="date" value={createForm.requested_delivery} onChange={(e) => setCreateForm((prev) => ({ ...prev, requested_delivery: e.target.value }))} /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>Products and quantities *</Label><Button size="sm" variant="outline" onClick={() => setCreateForm((prev) => ({ ...prev, lines: [...prev.lines, { model_id: "", quantity: 1 }] }))}><Plus className="mr-1 h-3 w-3" /> Add line</Button></div>
              {createForm.lines.map((line, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-2">
                  <Select value={line.model_id || undefined} onValueChange={(model_id) => setCreateForm((prev) => ({ ...prev, lines: prev.lines.map((x, i) => i === index ? { ...x, model_id } : x) }))}>
                    <SelectTrigger><SelectValue placeholder={modelsQuery.isLoading ? "Loading products…" : "Select model or product"} /></SelectTrigger>
                    <SelectContent>{(modelsQuery.data ?? []).map((model) => <SelectItem key={model.id} value={model.id}>{model.name}{model.size ? " — " + model.size : ""}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input aria-label={"Quantity for item " + (index + 1)} type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => setCreateForm((prev) => ({ ...prev, lines: prev.lines.map((x, i) => i === index ? { ...x, quantity: Number(e.target.value) } : x) }))} />
                  <Button aria-label={"Remove item " + (index + 1)} variant="ghost" size="sm" disabled={createForm.lines.length <= 1} onClick={() => setCreateForm((prev) => ({ ...prev, lines: prev.lines.filter((_, i) => i !== index) }))}>Remove</Button>
                </div>
              ))}
              {modelsQuery.isError && <p className="text-xs text-destructive">Product models could not be loaded.</p>}
            </div>
            <div className="space-y-1.5"><Label>Notes for Accounts</Label><Textarea rows={3} value={createForm.notes} onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Customer requirements, quotation details, or delivery notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={createRequest.isPending} onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={createRequest.isPending || customersQuery.isLoading || modelsQuery.isLoading} onClick={() => createRequest.mutate()}>{createRequest.isPending ? "Submitting…" : "Submit request"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertOpen} onOpenChange={(open) => { if (!convertRequest.isPending) setConvertOpen(open); }}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Sales Order</DialogTitle>
            <DialogDescription>{selectedRequest?.request_number} — review line prices and dates. Saving creates the Sales Order and queues the Production receipt.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Sales Order date *</Label><Input type="date" value={convertForm.order_date} onChange={(e) => setConvertForm((prev) => ({ ...prev, order_date: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Expected delivery</Label><Input type="date" value={convertForm.expected_delivery} onChange={(e) => setConvertForm((prev) => ({ ...prev, expected_delivery: e.target.value }))} /></div>
            </div>
            <div className="space-y-2">
              <Label>Review unit prices (₹)</Label>
              {(selectedRequest?.sales_order_request_items ?? []).map((line) => (
                <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2">
                  <div className="text-sm">{line.product_name}{line.size ? " · " + line.size : ""}<div className="text-xs text-muted-foreground">Quantity: {Number(line.quantity).toLocaleString("en-IN")}</div></div>
                  <Input type="number" min="0" step="0.01" value={convertForm.prices[line.id] ?? ""} aria-label={"Unit price for " + line.product_name} onChange={(e) => setConvertForm((prev) => ({ ...prev, prices: { ...prev.prices, [line.id]: e.target.value } }))} />
                </div>
              ))}
            </div>
            <div className="space-y-1.5"><Label>Order notes</Label><Textarea rows={2} value={convertForm.notes} onChange={(e) => setConvertForm((prev) => ({ ...prev, notes: e.target.value }))} /></div>
            <div className="rounded-md border p-3 text-xs text-muted-foreground">The conversion is transactional: the request is marked converted only when the Sales Order and all its lines are saved. Repeating the same request cannot create another order.</div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={convertRequest.isPending} onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button disabled={convertRequest.isPending} onClick={() => convertRequest.mutate()}>{convertRequest.isPending ? "Saving…" : "Save Sales Order"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!labelPrompt} onOpenChange={(open) => { if (!open) { setLabelPrompt(null); setLabelLink(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print Barcode labels for this Order!?</DialogTitle>
            <DialogDescription>
              Sales Order {labelPrompt?.orderNumber} is already saved. Choosing No or Cancel does not undo it. Only product models explicitly classified as Mattress are sent to Smart Label Creator.
            </DialogDescription>
          </DialogHeader>
          {labelLink && (
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">Label batch prepared: {labelLink.count} label(s)</div>
              <div className="mt-1 text-xs text-muted-foreground">{labelLink.excluded} non-mattress or unclassified order line(s) excluded.</div>
              <a className="mt-2 inline-block underline" href={labelLink.url} target="_blank" rel="noreferrer">Open Smart Label Creator</a>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={labelBusy} onClick={() => { setLabelPrompt(null); setLabelLink(null); }}>Cancel</Button>
            <Button variant="outline" disabled={labelBusy} onClick={() => { setLabelPrompt(null); setLabelLink(null); toast.info("Barcode label preparation skipped."); }}>No</Button>
            <Button disabled={labelBusy || !!labelLink} onClick={() => void openLabelHandoff()}>{labelBusy ? "Preparing…" : labelLink ? "Prepared" : "Yes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
