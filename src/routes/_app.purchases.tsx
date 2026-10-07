import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uninstalledAccountingFunction } from "@/lib/accounting";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Pencil,
  Printer,
  Send,
  Mail,
  Zap,
  Megaphone,
  MessageCircle,
  PackageCheck,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { toast } from "sonner";
import { inr, formatDate } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { createVendorInvite } from "@/lib/vendor-invite.functions";
import { notifyVendorPurchaseBill } from "@/lib/whatsapp.functions";
import { notifyStaffEvent } from "@/lib/staff-notifications.functions";
import { createPurchaseBill } from "@/lib/procurement-admin.functions";
import { quickAddSupplier, deleteSupplier, broadcastPromo, saveSupplier } from "@/lib/parties-admin.functions";
import { setPromoOptIn } from "@/lib/notifications-admin.functions";
import { PartyMessagesDialog } from "@/components/PartyMessagesDialog";

export const Route = createFileRoute("/_app/purchases")({ component: PurchasesPage });

function ReceiveBillButton({
  billId,
  billNumber,
  onDone,
}: {
  billId: string;
  billNumber: string;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const receive = async () => {
    if (
      !confirm(
        `Mark purchase bill ${billNumber} as received? This will post inventory and the supplier payable.`,
      )
    )
      return;
    setPending(true);
    try {
      const { error } = await supabase.rpc("receive_purchase_bill", { p_bill: billId } as never);
      if (error) throw error;
      toast.success(`Purchase bill ${billNumber} received. Inventory and payable posted.`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Receipt failed");
    } finally {
      setPending(false);
    }
  };
  return (
    <Button size="sm" variant="outline" className="h-8 px-2" onClick={receive} disabled={pending}>
      <PackageCheck className="h-4 w-4 mr-1" />
      {pending ? "Posting…" : "Receive"}
    </Button>
  );
}

type Supplier = {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  user_id: string | null;
  promo_opt_in?: boolean;
};

type Bill = {
  id: string;
  bill_number: string;
  supplier_id: string | null;
  bill_date: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  notes: string | null;
  vendor_ack_status: string;
  vendor_ack_at: string | null;
  vendor_ack_note: string | null;
  expected_dispatch_date: string | null;
  receipt_status: "draft" | "received" | "cancelled";
};
type NotifLog = {
  ref_id: string | null;
  event_type: string;
  status: string;
  error: string | null;
  sent_at: string;
  recipient_phone: string | null;
};

function PurchasesPage() {
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "production"]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Suppliers and purchase bills. Stock auto-updates BOQ."
        actions={<AiInsightButton topic="suppliers" label="Analyze pricing" />}
      />
      <PageBody>
        <Tabs defaultValue="bills">
          <TabsList>
            <TabsTrigger value="bills">Purchase Bills</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>
          <TabsContent value="bills">
            <BillsTab canEdit={canEdit} onPreview={setPreviewUrl} />
          </TabsContent>
          <TabsContent value="suppliers">
            <SuppliersTab canEdit={canEdit} onPreview={setPreviewUrl} />
          </TabsContent>
        </Tabs>
      </PageBody>
      <PrintPreviewModal
        url={previewUrl}
        title="Print Preview"
        onClose={() => setPreviewUrl(null)}
      />
    </>
  );
}

/* ---------------- Suppliers ---------------- */

function SuppliersTab({
  canEdit,
  onPreview,
}: {
  canEdit: boolean;
  onPreview: (url: string) => void;
}) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", gstin: "", phone: "", email: "", address: "" });
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState({ name: "", phone: "" });
  const [promoOpen, setPromoOpen] = useState(false);
  const [msgFor, setMsgFor] = useState<Supplier | null>(null);
  const quickAdd = useServerFn(quickAddSupplier);
  const removeSupplier = useServerFn(deleteSupplier);
  const broadcast = useServerFn(broadcastPromo);
  const setOptIn = useServerFn(setPromoOptIn);
  const saveSupplierFn = useServerFn(saveSupplier);

  const doQuickAdd = async () => {
    if (!quickForm.name.trim() || !quickForm.phone.trim()) {
      toast.error("Name and mobile required");
      return;
    }
    try {
      await quickAdd({ data: { name: quickForm.name.trim(), phone: quickForm.phone.trim() } });
      toast.success("Supplier added");
      setQuickOpen(false);
      setQuickForm({ name: "", phone: "" });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const doDelete = async (s: Supplier) => {
    if (!confirm(`Delete supplier "${s.name}"? This cannot be undone.`)) return;
    try {
      await removeSupplier({ data: { id: s.id } });
      toast.success("Supplier deleted");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };
  const doBroadcast = async () => {
    try {
      const r = await broadcast({ data: { audience: "suppliers" } });
      toast.success(`Promo sent to ${r.sent}/${r.total} suppliers`);
      setPromoOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Broadcast failed");
    }
  };

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
        name: form.name,
        gstin: form.gstin || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
      };
      await saveSupplierFn({ data: { ...payload, id: edit?.id } });
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setOpen(false);
      setEdit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEdit(null);
    setForm({ name: "", gstin: "", phone: "", email: "", address: "" });
    setOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setEdit(s);
    setForm({
      name: s.name,
      gstin: s.gstin ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
    });
    setOpen(true);
  };

  return (
    <Card className="mt-4">
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4 gap-2 flex-wrap">
          <div className="text-sm text-muted-foreground">Suppliers used on purchase bills.</div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setPromoOpen(true)}>
                <Megaphone className="h-4 w-4 mr-1" />
                Send Promo
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setQuickOpen(true)}>
                <Zap className="h-4 w-4 mr-1" />
                Quick Add
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" />
                New Supplier
              </Button>
            )}
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No suppliers yet.
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs">{s.gstin ?? "—"}</TableCell>
                  <TableCell>{s.phone ?? "—"}</TableCell>
                  <TableCell>{s.email ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Print preview"
                      onClick={() => onPreview(`/print/supplier-ledger/${s.id}`)}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Message history"
                      onClick={() => setMsgFor(s)}
                    >
                      <MessageCircle className="h-4 w-4 opacity-60" />
                    </Button>
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title={
                          s.promo_opt_in === false
                            ? "Promo opted-out (click to opt in). Order updates still send."
                            : "Opt-out of promos (order updates still send)"
                        }
                        onClick={async () => {
                          try {
                            await setOptIn({
                              data: {
                                party_kind: "vendor",
                                party_id: s.id,
                                promo_opt_in: !(s.promo_opt_in !== false),
                              },
                            });
                            qc.invalidateQueries({ queryKey: ["suppliers"] });
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed");
                          }
                        }}
                      >
                        <span
                          className={`inline-flex h-5 items-center rounded px-1.5 text-[10px] font-medium ${s.promo_opt_in === false ? "bg-slate-200 text-slate-700" : "bg-primary text-primary-foreground"}`}
                        >
                          Promo {s.promo_opt_in === false ? "OFF" : "ON"}
                        </span>
                      </Button>
                    )}
                    {canEdit && <InviteVendorButton supplier={s} />}
                    {canEdit && (
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Delete supplier"
                        onClick={() => doDelete(s)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Edit Supplier" : "New Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">GSTIN</Label>
                <Input
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Address</Label>
              <Textarea
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Quick Add Supplier</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input
                value={quickForm.name}
                onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })}
                placeholder="Supplier name"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Mobile *</Label>
              <Input
                value={quickForm.phone}
                onChange={(e) => setQuickForm({ ...quickForm, phone: e.target.value })}
                placeholder="10-digit mobile or +91…"
              />
            </div>
            <p className="text-xs text-muted-foreground">No message is sent automatically.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doQuickAdd}>Add Supplier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={promoOpen} onOpenChange={setPromoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Marketing Promo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-xs text-muted-foreground">
              Sends the active approved promotional template to opted-in suppliers.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doBroadcast}>Send Broadcast</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PartyMessagesDialog
        open={!!msgFor}
        onOpenChange={(v) => {
          if (!v) setMsgFor(null);
        }}
        party_kind="vendor"
        party_id={msgFor?.id ?? null}
        party_name={msgFor?.name ?? ""}
      />
    </Card>
  );
}

/* ---------------- Bills ---------------- */

function AckBadge({ bill }: { bill: Bill }) {
  const s = bill.vendor_ack_status || "pending";
  const cls =
    s === "accepted"
      ? "bg-green-100 text-green-800"
      : s === "rejected"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-800";
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`inline-flex w-fit rounded px-2 py-0.5 text-xs font-medium ${cls}`}
        title={bill.vendor_ack_note ?? ""}
      >
        {label}
      </span>
      {bill.vendor_ack_at && (
        <span className="text-[10px] text-muted-foreground">{formatDate(bill.vendor_ack_at)}</span>
      )}
      {bill.expected_dispatch_date && s === "accepted" && (
        <span className="text-[10px] text-muted-foreground">
          Dispatch: {formatDate(bill.expected_dispatch_date)}
        </span>
      )}
    </div>
  );
}

function NotifBadge({
  notif,
}: {
  notif?: { status: string; error: string | null; sent_at: string; recipient_phone: string | null };
}) {
  if (!notif) return <span className="text-xs text-muted-foreground">—</span>;
  const s = notif.status;
  const cls =
    s === "sent"
      ? "bg-green-100 text-green-800"
      : s === "skipped"
        ? "bg-slate-100 text-slate-700"
        : s === "failed"
          ? "bg-red-100 text-red-800"
          : "bg-amber-100 text-amber-800";
  const label = s === "sent" ? "Delivered" : s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`inline-flex w-fit rounded px-2 py-0.5 text-xs font-medium ${cls}`}
        title={notif.error ?? notif.recipient_phone ?? ""}
      >
        {label}
      </span>
      <span className="text-[10px] text-muted-foreground">{formatDate(notif.sent_at)}</span>
    </div>
  );
}

type BillItem = { raw_material_id: string; quantity: number; unit_price: number };

function BillsTab({ canEdit, onPreview }: { canEdit: boolean; onPreview: (url: string) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [billNumber, setBillNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [cgstAmount, setCgstAmount] = useState(0);
  const [sgstAmount, setSgstAmount] = useState(0);
  const [igstAmount, setIgstAmount] = useState(0);
  const [items, setItems] = useState<BillItem[]>([
    { raw_material_id: "", quantity: 1, unit_price: 0 },
  ]);

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["purchase-bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select(
          "id, bill_number, supplier_id, bill_date, total_amount, subtotal, tax_amount, cgst_amount, sgst_amount, igst_amount, notes, vendor_ack_status, vendor_ack_at, vendor_ack_note, expected_dispatch_date, receipt_status",
        )
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Bill[];
    },
  });
  const billIds = bills.map((b) => b.id);
  const { data: notifs = [] } = useQuery({
    queryKey: ["purchase-bill-notifs", billIds.join(",")],
    enabled: billIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_log")
        .select("ref_id, event_type, status, error, sent_at, recipient_phone")
        .eq("ref_table", "purchase_bills")
        .in("ref_id", billIds)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotifLog[];
    },
  });
  const latestNotif = new Map<string, NotifLog>();
  for (const n of notifs) {
    if (n.ref_id && !latestNotif.has(n.ref_id)) latestNotif.set(n.ref_id, n);
  }
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
      const { data, error } = await supabase
        .from("raw_materials")
        .select("id, name, unit")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; unit: string }[];
    },
  });

  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const subtotal = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );
  const taxAmount = Number(cgstAmount || 0) + Number(sgstAmount || 0) + Number(igstAmount || 0);
  const total = subtotal + taxAmount;

  const resetForm = () => {
    setBillNumber("");
    setSupplierId("");
    setBillDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setCgstAmount(0);
    setSgstAmount(0);
    setIgstAmount(0);
    setItems([{ raw_material_id: "", quantity: 1, unit_price: 0 }]);
  };

  const createPurchaseBillFn = useServerFn(createPurchaseBill);
  const notifyVendor = useServerFn(notifyVendorPurchaseBill);
  const notifyStaff = useServerFn(notifyStaffEvent);
  const create = useMutation({
    mutationFn: async () => {
      if (!billNumber.trim()) throw new Error("Bill number required");
      if (!supplierId) throw new Error("Select a supplier");
      if (items.some((i) => !i.raw_material_id || !(Number(i.quantity) > 0)))
        throw new Error("All lines need material + positive quantity");
      if (items.some((i) => Number(i.unit_price) < 0))
        throw new Error("Unit price cannot be negative");
      return createPurchaseBillFn({
        data: {
          bill_number: billNumber,
          supplier_id: supplierId,
          bill_date: billDate,
          notes: notes || null,
          cgst_amount: Number(cgstAmount || 0),
          sgst_amount: Number(sgstAmount || 0),
          igst_amount: Number(igstAmount || 0),
          lines: items.map((i) => ({
            raw_material_id: i.raw_material_id,
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price),
          })),
        },
      });
    },
    onSuccess: async (res) => {
      const billId = res.id;
      toast.success("Purchase bill saved as draft. Stock is posted only when it is marked received.");
      qc.invalidateQueries({ queryKey: ["purchase-bills"] });
      qc.invalidateQueries({ queryKey: ["purchase-bill-notifs"] });
      qc.invalidateQueries({ queryKey: ["raw-materials"] });
      setOpen(false);
      const savedSupplier = supplierId;
      resetForm();
      if (savedSupplier) {
        try {
          const r = await notifyVendor({ data: { bill_id: billId, event: "created" } });
          if (r?.ok) toast.success("Vendor notified via WhatsApp");
        } catch {}
      }
      notifyStaff({ data: { event: "staff.purchase_bill.created", ref_id: billId } }).catch(() => {});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="mt-4">
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4">
          <div className="text-sm text-muted-foreground">
            Saving a bill does not receive stock. Mark received to post a stock movement.
          </div>
          {canEdit && (
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setBillNumber(`PB-${Date.now().toString().slice(-6)}`);
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              New Bill
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vendor Ack</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : bills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No purchase bills yet.
                </TableCell>
              </TableRow>
            ) : (
              bills.map((b) => {
                const n = latestNotif.get(b.id);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.bill_number}</TableCell>
                    <TableCell>
                      {b.supplier_id ? (supplierMap.get(b.supplier_id) ?? "—") : "—"}
                    </TableCell>
                    <TableCell>{formatDate(b.bill_date)}</TableCell>
                    <TableCell className="text-right font-medium">{inr(b.total_amount)}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${b.receipt_status === "received" ? "bg-emerald-100 text-emerald-800" : b.receipt_status === "cancelled" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}
                      >
                        {b.receipt_status === "received"
                          ? "Received"
                          : b.receipt_status === "cancelled"
                            ? "Cancelled"
                            : "Draft"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <AckBadge bill={b} />
                    </TableCell>
                    <TableCell>
                      <NotifBadge notif={n} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {b.receipt_status === "draft" && canEdit && (
                          <ReceiveBillButton
                            billId={b.id}
                            billNumber={b.bill_number}
                            onDone={() => {
                              qc.invalidateQueries({ queryKey: ["purchase-bills"] });
                              qc.invalidateQueries({ queryKey: ["raw-materials"] });
                            }}
                          />
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Print preview"
                          onClick={() => onPreview(`/print/purchase/${b.id}`)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Purchase Bill</DialogTitle>
            <DialogDescription>
              The bill is saved as a draft. Stock is not changed until it is marked received.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Bill # *</Label>
                <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Bill Date</Label>
                <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Line Items</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setItems([...items, { raw_material_id: "", quantity: 1, unit_price: 0 }])
                  }
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((it, idx) => {
                  const unit = materials.find((m) => m.id === it.raw_material_id)?.unit ?? "";
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6">
                        <Select
                          value={it.raw_material_id}
                          onValueChange={(v) =>
                            setItems(
                              items.map((x, i) => (i === idx ? { ...x, raw_material_id: v } : x)),
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Material" />
                          </SelectTrigger>
                          <SelectContent>
                            {materials.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name} ({m.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        className="col-span-2"
                        type="number"
                        min="0"
                        step="0.001"
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
                      <span className="col-span-1 text-xs text-muted-foreground">{unit}</span>
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
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">CGST ₹</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cgstAmount}
                  onChange={(e) => {
                    setCgstAmount(Number(e.target.value) || 0);
                    if (Number(e.target.value) > 0) setIgstAmount(0);
                  }}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">SGST ₹</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={sgstAmount}
                  onChange={(e) => {
                    setSgstAmount(Number(e.target.value) || 0);
                    if (Number(e.target.value) > 0) setIgstAmount(0);
                  }}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">IGST ₹</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={igstAmount}
                  onChange={(e) => {
                    setIgstAmount(Number(e.target.value) || 0);
                    if (Number(e.target.value) > 0) {
                      setCgstAmount(0);
                      setSgstAmount(0);
                    }
                  }}
                />
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{inr(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{inr(taxAmount)}</span>
              </div>
            </div>

            <div>
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
              {create.isPending ? "Saving…" : "Save Bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- Vendor Invite ---------------- */

function InviteVendorButton({ supplier }: { supplier: Supplier }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(supplier.email ?? "");
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const create = useServerFn(createVendorInvite);

  const already = !!supplier.user_id;

  const generate = async () => {
    if (!email.trim()) {
      toast.error("Enter vendor email");
      return;
    }
    setLoading(true);
    try {
      const { token } = await create({ data: { supplier_id: supplier.id, email } });
      const url = `${window.location.origin}/vendor-signup?token=${encodeURIComponent(token)}`;
      setLink(url);
      toast.success("Invite link generated — share it with the vendor");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        title={already ? "Vendor portal already linked" : "Invite to vendor portal"}
        onClick={() => setOpen(true)}
        disabled={already}
      >
        {already ? <Send className="h-4 w-4 text-emerald-600" /> : <Mail className="h-4 w-4" />}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setLink(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite {supplier.name} to the Vendor Portal</DialogTitle>
            <DialogDescription>
              Generates a one-time signup link valid for 14 days. The vendor will be able to view
              POs, acknowledge them, download invoices, and see their ledger.
            </DialogDescription>
          </DialogHeader>
          {!link ? (
            <div className="space-y-3 py-2">
              <Label className="text-xs">Vendor email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vendor@example.com"
              />
            </div>
          ) : (
            <div className="space-y-2 py-2">
              <Label className="text-xs">Share this link with the vendor</Label>
              <Textarea readOnly rows={3} value={link} className="font-mono text-xs" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  toast.success("Copied");
                }}
              >
                Copy link
              </Button>
            </div>
          )}
          <DialogFooter>
            {!link && (
              <Button onClick={generate} disabled={loading}>
                {loading ? "Generating…" : "Generate invite"}
              </Button>
            )}
            {link && <Button onClick={() => setOpen(false)}>Done</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
