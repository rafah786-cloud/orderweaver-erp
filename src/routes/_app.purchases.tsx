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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Pencil, Printer } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { toast } from "sonner";
import { inr, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/purchases")({ component: PurchasesPage });

type Supplier = { id: string; name: string; gstin: string | null; phone: string | null; email: string | null; address: string | null };
type Bill = { id: string; bill_number: string; supplier_id: string | null; bill_date: string; total_amount: number; notes: string | null };

function PurchasesPage() {
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "production"]);

  return (
    <>
      <PageHeader title="Purchases" description="Suppliers and purchase bills. Stock auto-updates BOQ." />
      <PageBody>
        <Tabs defaultValue="bills">
          <TabsList>
            <TabsTrigger value="bills">Purchase Bills</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>
          <TabsContent value="bills"><BillsTab canEdit={canEdit} /></TabsContent>
          <TabsContent value="suppliers"><SuppliersTab canEdit={canEdit} /></TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}

/* ---------------- Suppliers ---------------- */

function SuppliersTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", gstin: "", phone: "", email: "", address: "" });

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name required");
      const payload = {
        name: form.name, gstin: form.gstin || null, phone: form.phone || null,
        email: form.email || null, address: form.address || null,
      };
      const { error } = edit
        ? await supabase.from("suppliers").update(payload).eq("id", edit.id)
        : await supabase.from("suppliers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setOpen(false); setEdit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEdit(null); setForm({ name: "", gstin: "", phone: "", email: "", address: "" }); setOpen(true); };
  const openEdit = (s: Supplier) => {
    setEdit(s);
    setForm({ name: s.name, gstin: s.gstin ?? "", phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "" });
    setOpen(true);
  };

  return (
    <Card className="mt-4">
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4">
          <div className="text-sm text-muted-foreground">Suppliers used on purchase bills.</div>
          {canEdit && <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />New Supplier</Button>}
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>GSTIN</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            : suppliers.length === 0 ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No suppliers yet.</TableCell></TableRow>
            : suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="font-mono text-xs">{s.gstin ?? "—"}</TableCell>
                <TableCell>{s.phone ?? "—"}</TableCell>
                <TableCell>{s.email ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="icon" variant="ghost" title="Print ledger">
                    <Link to="/print/supplier-ledger/$id" params={{ id: s.id }} target="_blank">
                      <Printer className="h-4 w-4" />
                    </Link>
                  </Button>
                  {canEdit && <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit ? "Edit Supplier" : "New Supplier"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div><Label className="text-xs text-muted-foreground">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs text-muted-foreground">GSTIN</Label>
                <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
              <div><Label className="text-xs text-muted-foreground">Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div><Label className="text-xs text-muted-foreground">Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label className="text-xs text-muted-foreground">Address</Label>
              <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- Bills ---------------- */

type BillItem = { raw_material_id: string; quantity: number; unit_price: number };

function BillsTab({ canEdit }: { canEdit: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [billNumber, setBillNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<BillItem[]>([{ raw_material_id: "", quantity: 1, unit_price: 0 }]);

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["purchase-bills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_bills")
        .select("id, bill_number, supplier_id, bill_date, total_amount, notes")
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Bill[];
    },
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const { data: materials = [] } = useQuery({
    queryKey: ["raw-materials-pick"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("id, name, unit").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; unit: string }[];
    },
  });

  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const total = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);

  const resetForm = () => {
    setBillNumber(""); setSupplierId(""); setBillDate(new Date().toISOString().slice(0, 10));
    setNotes(""); setItems([{ raw_material_id: "", quantity: 1, unit_price: 0 }]);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!billNumber.trim()) throw new Error("Bill number required");
      if (items.some((i) => !i.raw_material_id || !(i.quantity > 0))) throw new Error("All lines need material + qty");
      const { data: bill, error } = await supabase.from("purchase_bills").insert({
        bill_number: billNumber, supplier_id: supplierId || null, bill_date: billDate,
        total_amount: total, notes: notes || null, created_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      const { error: iErr } = await supabase.from("purchase_bill_items").insert(
        items.map((i) => ({ purchase_bill_id: bill.id, raw_material_id: i.raw_material_id,
          quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
      );
      if (iErr) throw iErr;
    },
    onSuccess: () => {
      toast.success("Purchase bill saved. Raw-material stock updated.");
      qc.invalidateQueries({ queryKey: ["purchase-bills"] });
      qc.invalidateQueries({ queryKey: ["raw-materials"] });
      setOpen(false); resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="mt-4">
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4">
          <div className="text-sm text-muted-foreground">Stock auto-adds to BOQ on save.</div>
          {canEdit && <Button size="sm" onClick={() => { resetForm(); setBillNumber(`PB-${Date.now().toString().slice(-6)}`); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />New Bill
          </Button>}
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Bill #</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="w-12" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            : bills.length === 0 ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No purchase bills yet.</TableCell></TableRow>
            : bills.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.bill_number}</TableCell>
                <TableCell>{b.supplier_id ? (supplierMap.get(b.supplier_id) ?? "—") : "—"}</TableCell>
                <TableCell>{formatDate(b.bill_date)}</TableCell>
                <TableCell className="text-right font-medium">{inr(b.total_amount)}</TableCell>
                <TableCell>
                  <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Print bill">
                    <Link to="/print/purchase/$id" params={{ id: b.id }} target="_blank">
                      <Printer className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Purchase Bill</DialogTitle>
            <DialogDescription>Adds quantities to raw-material stock automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-muted-foreground">Bill # *</Label>
                <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} /></div>
              <div><Label className="text-xs text-muted-foreground">Bill Date</Label>
                <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></div>
            </div>
            <div><Label className="text-xs text-muted-foreground">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select></div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Line Items</Label>
                <Button size="sm" variant="outline" onClick={() => setItems([...items, { raw_material_id: "", quantity: 1, unit_price: 0 }])}>
                  <Plus className="h-3 w-3 mr-1" />Add
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((it, idx) => {
                  const unit = materials.find((m) => m.id === it.raw_material_id)?.unit ?? "";
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6">
                        <Select value={it.raw_material_id}
                          onValueChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, raw_material_id: v } : x))}>
                          <SelectTrigger><SelectValue placeholder="Material" /></SelectTrigger>
                          <SelectContent>
                            {materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input className="col-span-2" type="number" min="0" step="0.001" placeholder="Qty"
                        value={it.quantity}
                        onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))} />
                      <span className="col-span-1 text-xs text-muted-foreground">{unit}</span>
                      <Input className="col-span-2" type="number" min="0" placeholder="Unit ₹"
                        value={it.unit_price}
                        onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value) } : x))} />
                      <Button className="col-span-1" size="icon" variant="ghost"
                        onClick={() => setItems(items.length > 1 ? items.filter((_, i) => i !== idx) : items)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div><Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

            <div className="rounded-md border bg-muted/40 p-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold text-base">{inr(total)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save Bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
