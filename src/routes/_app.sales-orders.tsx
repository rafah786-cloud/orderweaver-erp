import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { inr, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/sales-orders")({
  component: SalesOrdersPage,
});

type Item = { product_name: string; size: string; quantity: number; unit_price: number };

type Order = {
  id: string;
  order_number: string;
  party_id: string;
  order_date: string;
  expected_delivery: string | null;
  total_amount: number;
  notes: string | null;
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
  const [items, setItems] = useState<Item[]>([{ product_name: "", size: "", quantity: 1, unit_price: 0 }]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["sales-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("id, order_number, party_id, order_date, expected_delivery, total_amount, notes")
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

  const partyMap = new Map(parties.map((p) => [p.id, p.name]));
  const total = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);

  const resetForm = () => {
    setPartyId("");
    setOrderDate(new Date().toISOString().slice(0, 10));
    setExpectedDelivery("");
    setNotes("");
    setItems([{ product_name: "", size: "", quantity: 1, unit_price: 0 }]);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!partyId) throw new Error("Select a party");
      if (items.some((i) => !i.product_name.trim())) throw new Error("All line items need a product name");
      if (total <= 0) throw new Error("Order total must be greater than zero");

      const orderNumber = `SO-${Date.now().toString().slice(-8)}`;
      const { data: so, error: soErr } = await supabase
        .from("sales_orders")
        .insert({
          order_number: orderNumber,
          party_id: partyId,
          order_date: orderDate,
          expected_delivery: expectedDelivery || null,
          total_amount: total,
          notes: notes || null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (soErr) throw soErr;

      const { error: itemErr } = await supabase.from("sales_order_items").insert(
        items.map((i) => ({
          sales_order_id: so.id,
          product_name: i.product_name,
          size: i.size || null,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          amount: Number(i.quantity) * Number(i.unit_price),
        })),
      );
      if (itemErr) throw itemErr;
    },
    onSuccess: () => {
      toast.success("Sales order created. Production order generated automatically.");
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      setOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Sales Orders"
        description="A production order is auto-created the moment a sales order is saved."
        actions={canCreate ? <Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Order</Button> : undefined}
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
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : orders.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No sales orders yet.</TableCell></TableRow>
                ) : orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.order_number}</TableCell>
                    <TableCell>{partyMap.get(o.party_id) ?? "—"}</TableCell>
                    <TableCell>{formatDate(o.order_date)}</TableCell>
                    <TableCell>{formatDate(o.expected_delivery)}</TableCell>
                    <TableCell className="text-right font-medium">{inr(o.total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Sales Order</DialogTitle>
            <DialogDescription>Production tracking starts automatically once saved.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Party *</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger><SelectValue placeholder="Select party" /></SelectTrigger>
                <SelectContent>
                  {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Order Date</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Expected Delivery</Label>
                <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Line Items</Label>
                <Button size="sm" variant="outline" onClick={() => setItems([...items, { product_name: "", size: "", quantity: 1, unit_price: 0 }])}>
                  <Plus className="h-3 w-3 mr-1" />Add
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                    <Input className="col-span-5" placeholder="Product (e.g. King Memory Foam)" value={it.product_name}
                      onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, product_name: e.target.value } : x))} />
                    <Input className="col-span-2" placeholder="Size" value={it.size}
                      onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, size: e.target.value } : x))} />
                    <Input className="col-span-2" type="number" min="0" placeholder="Qty" value={it.quantity}
                      onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))} />
                    <Input className="col-span-2" type="number" min="0" placeholder="Unit ₹" value={it.unit_price}
                      onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value) } : x))} />
                    <Button className="col-span-1" size="icon" variant="ghost"
                      onClick={() => setItems(items.length > 1 ? items.filter((_, i) => i !== idx) : items)}>
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
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Creating…" : "Create Order"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
