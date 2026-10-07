import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { TableState } from "@/components/ui/table-state";
import { AiInsightButton } from "@/components/ai/AiInsightButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { inr, formatDate } from "@/lib/format";
import { notifyCustomerEvent } from "@/lib/whatsapp.functions";
import { notifyStaffEvent } from "@/lib/staff-notifications.functions";
import { createSalesOrder } from "@/lib/sales-orders-admin.functions";

export const Route = createFileRoute("/_app/sales-orders")({
  head: () => ({
    meta: [
      { title: "Sales Orders | Mattress Maestro ERP" },
      { name: "description", content: "Track sales orders and automated production pipeline." },
    ],
  }),
  component: SalesOrdersPage,
});

type Item = {
  model_id: string;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
};
type ModelOption = { id: string; name: string; size: string | null; default_price: number };

type Order = {
  id: string;
  order_number: string;
  party_id: string;
  order_date: string;
  expected_delivery: string | null;
  total_amount: number;
  notes: string | null;
  fulfillment_status: "draft" | "confirmed" | "dispatched" | "cancelled";
};

function SalesOrdersPage() {
  const { hasAnyRole, user } = useAuth();
  const canCreate = hasAnyRole(["admin", "sales"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([
    { model_id: "", product_name: "", size: "", quantity: 1, unit_price: 0 },
  ]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["sales-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select(
          "id, order_number, party_id, order_date, expected_delivery, total_amount, notes, fulfillment_status",
        )
        .order("order_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  const { data: parties = [] } = useQuery({
    queryKey: ["parties-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parties").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: models = [] } = useQuery({
    queryKey: ["models-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_models")
        .select("id, name, size, default_price")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ModelOption[];
    },
  });

  const partyMap = new Map(parties.map((p) => [p.id, p.name]));
  const total = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );

  const resetForm = () => {
    setPartyId("");
    setOrderDate(new Date().toISOString().slice(0, 10));
    setExpectedDelivery("");
    setNotes("");
    setItems([{ model_id: "", product_name: "", size: "", quantity: 1, unit_price: 0 }]);
  };

  const pickModel = (idx: number, modelId: string) => {
    const m = models.find((x) => x.id === modelId);
    setItems(
      items.map((x, i) =>
        i === idx
          ? {
              ...x,
              model_id: modelId,
              product_name: m?.name ?? x.product_name,
              size: m?.size ?? x.size,
              unit_price: m?.default_price ?? x.unit_price,
            }
          : x,
      ),
    );
  };

  const createSalesOrderFn = useServerFn(createSalesOrder);
  const createIdempotencyKey = useRef(`sales-order:${crypto.randomUUID()}`);
  const notifyCustomer = useServerFn(notifyCustomerEvent);
  const notifyStaff = useServerFn(notifyStaffEvent);
  const confirmOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc("reserve_sales_order", {
        p_order: orderId,
        p_godown: null,
      } as never);
      if (error) throw error;
      return orderId;
    },
    onSuccess: () => {
      toast.success("Sales order confirmed and stock reserved.");
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!partyId) throw new Error("Select a party");
      if (items.some((i) => !i.model_id))
        throw new Error("Every line must select a registered model. Add it in BOQ first.");
      if (items.some((i) => !Number.isFinite(Number(i.quantity)) || Number(i.quantity) <= 0))
        throw new Error("Every line must have a positive quantity");
      if (items.some((i) => !Number.isFinite(Number(i.unit_price)) || Number(i.unit_price) < 0))
        throw new Error("Every line must have a valid non-negative unit price");

      return createSalesOrderFn({
        data: {
          party_id: partyId,
          order_date: orderDate,
          expected_delivery: expectedDelivery || null,
          notes: notes || null,
          idempotencyKey: createIdempotencyKey.current,
          lines: items.map((i) => ({
            model_id: i.model_id,
            product_name: i.product_name,
            size: i.size || null,
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price),
          })),
        },
      });
    },
    onSuccess: async (res) => {
      toast.success("Sales order created. Ordered quantity is saved. Nothing is reserved or dispatched.");
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      setOpen(false);
      const savedParty = partyId;
      resetForm();
      try {
        const r = await notifyCustomer({ data: { party_id: savedParty, event: "sales_order.created", ref_id: res.id } });
        if (r?.ok) toast.success("Customer notified via WhatsApp");
      } catch {}
      notifyStaff({ data: { event: "staff.sales_order.created", ref_id: res.id } }).catch(() => {});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Sales Orders"
        description="A production order is auto-created the moment a sales order is saved."
        actions={
          <div className="flex items-center gap-2">
            <AiInsightButton topic="sales" label="Explain this trend" />
            {canCreate && (
              <Button
                onClick={() => {
                  resetForm();
                  setOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Order
              </Button>
            )}
          </div>
        }
      />
      <PageBody>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Dispatched</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No sales orders yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.order_number}</TableCell>
                      <TableCell>{partyMap.get(o.party_id) ?? "—"}</TableCell>
                      <TableCell>{formatDate(o.order_date)}</TableCell>
                      <TableCell>{formatDate(o.expected_delivery)}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${o.fulfillment_status === "confirmed" ? "bg-emerald-100 text-emerald-800" : o.fulfillment_status === "dispatched" ? "bg-sky-100 text-sky-800" : o.fulfillment_status === "cancelled" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
                        >
                          {o.fulfillment_status === "confirmed"
                            ? "Confirmed"
                            : o.fulfillment_status === "dispatched"
                              ? "Dispatched"
                              : o.fulfillment_status === "cancelled"
                                ? "Cancelled"
                                : "Draft"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {inr(o.total_amount)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell>
                        {o.fulfillment_status === "draft" && canCreate && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => confirmOrder.mutate(o.id)}
                            disabled={confirmOrder.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            {confirmOrder.isPending ? "Confirming…" : "Confirm"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Sales Order</DialogTitle>
            <DialogDescription>
              Production tracking starts automatically once saved.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Party *</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select party" />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Order Date</Label>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Expected Delivery</Label>
                <Input
                  type="date"
                  value={expectedDelivery}
                  onChange={(e) => setExpectedDelivery(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Line Items</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setItems([
                      ...items,
                      { model_id: "", product_name: "", size: "", quantity: 1, unit_price: 0 },
                    ])
                  }
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              {models.length === 0 && (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground mb-2">
                  No models yet. Add them with specifications in{" "}
                  <span className="font-medium">BOQ → Models</span> before placing orders.
                </div>
              )}
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Select value={it.model_id} onValueChange={(v) => pickModel(idx, v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                              {m.size ? ` — ${m.size}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      className="col-span-2"
                      placeholder="Size"
                      value={it.size}
                      onChange={(e) =>
                        setItems(
                          items.map((x, i) => (i === idx ? { ...x, size: e.target.value } : x)),
                        )
                      }
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      min="0"
                      placeholder="Qty"
                      value={it.quantity}
                      onChange={(e) =>
                        setItems(
                          items.map((x, i) =>
                            i === idx ? { ...x, quantity: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      min="0"
                      placeholder="Unit ₹"
                      value={it.unit_price}
                      onChange={(e) =>
                        setItems(
                          items.map((x, i) =>
                            i === idx ? { ...x, unit_price: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                    <Button
                      className="col-span-1"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setItems(items.length > 1 ? items.filter((_, i) => i !== idx) : items)
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="rounded-md border bg-muted/40 p-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold text-base">{inr(total)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
