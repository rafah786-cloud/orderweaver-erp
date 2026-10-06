import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, AlertTriangle, Printer, MessageCircle, Trash2, Zap, Megaphone } from "lucide-react";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { toast } from "sonner";
import { inr, daysBetween, formatDate } from "@/lib/format";
import { notifyCustomerEvent } from "@/lib/whatsapp.functions";
import { quickAddParty, deleteParty, broadcastPromo } from "@/lib/parties-admin.functions";
import { setPromoOptIn } from "@/lib/notifications-admin.functions";
import { PartyMessagesDialog } from "@/components/PartyMessagesDialog";


export const Route = createFileRoute("/_app/parties")({
  component: PartiesPage,
});

type PartyRow = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  credit_limit: number;
  notes: string | null;
  opening_balance: number;
  current_balance: number;
  whatsapp_opt_in?: boolean;
  promo_opt_in?: boolean;
};


type OutstandingRow = {
  party_id: string;
  outstanding: number;
  oldest_unpaid_date: string | null;
};

const empty: Omit<PartyRow, "id"> = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  gstin: "",
  credit_limit: 150000,
  notes: "",
  opening_balance: 0,
  current_balance: 0,
};

function PartiesPage() {
  const { hasAnyRole, hasRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "sales"]);
  const isAdmin = hasRole("admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState({ name: "", phone: "" });
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoMsg, setPromoMsg] = useState("");
  const [editing, setEditing] = useState<PartyRow | null>(null);
  const [form, setForm] = useState<Omit<PartyRow, "id">>(empty);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [msgFor, setMsgFor] = useState<PartyRow | null>(null);
  const notifyCustomer = useServerFn(notifyCustomerEvent);
  const quickAdd = useServerFn(quickAddParty);
  const removeParty = useServerFn(deleteParty);
  const broadcast = useServerFn(broadcastPromo);
  const setOptIn = useServerFn(setPromoOptIn);


  const sendStatement = async (p: PartyRow) => {
    setSendingId(p.id);
    try {
      const out = Number(outstandingMap.get(p.id)?.outstanding ?? 0);
      const body =
        `Zizz Mattress — Statement of Account\n` +
        `Account: ${p.name}\n` +
        `Closing balance: ₹${out.toFixed(2)}\n` +
        `Login to the portal to download your full ledger statement.`;
      const r = await notifyCustomer({ data: { party_id: p.id, event: "ledger.statement_ready", ref_table: "parties", ref_id: p.id, message: body } });
      if (r?.ok) toast.success("Statement sent on WhatsApp");
      else toast.error("Couldn't send WhatsApp statement");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSendingId(null);
    }
  };

  const { data: parties = [], isLoading } = useQuery({
    queryKey: ["parties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id, name, contact_person, phone, email, address, gstin, credit_limit, notes, opening_balance, current_balance, whatsapp_opt_in, promo_opt_in")
        .order("name");
      if (error) throw error;
      return (data ?? []) as PartyRow[];
    },
  });

  const { data: outstanding = [] } = useQuery({
    queryKey: ["party-outstanding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("party_outstanding")
        .select("party_id, outstanding, oldest_unpaid_date");
      if (error) throw error;
      return (data ?? []) as OutstandingRow[];
    },
  });

  const outstandingMap = new Map(outstanding.map((o) => [o.party_id, o]));

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      const payload = {
        name: form.name,
        contact_person: form.contact_person,
        phone: form.phone,
        email: form.email,
        address: form.address,
        gstin: form.gstin,
        credit_limit: Number(form.credit_limit) || 0,
        notes: form.notes,
        opening_balance: Number(form.opening_balance) || 0,
      };
      if (editing) {
        const { error } = await supabase.from("parties").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("parties").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Party updated" : "Party added");
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["party-outstanding"] });
      setOpen(false);
      setEditing(null);
      setForm(empty);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (p: PartyRow) => {
    setEditing(p);
    setForm({
      name: p.name, contact_person: p.contact_person ?? "", phone: p.phone ?? "",
      email: p.email ?? "", address: p.address ?? "", gstin: p.gstin ?? "",
      credit_limit: p.credit_limit, notes: p.notes ?? "",
      opening_balance: p.opening_balance ?? 0, current_balance: p.current_balance ?? 0,
    });
    setOpen(true);
  };

  const blockedStatus = (o?: OutstandingRow, limit = 150000) => {
    if (!o) return null;
    const out = Number(o.outstanding ?? 0);
    if (out >= limit) return { kind: "limit" as const };
    if (out >= 50000 && o.oldest_unpaid_date && daysBetween(o.oldest_unpaid_date) > 90)
      return { kind: "overdue" as const, days: daysBetween(o.oldest_unpaid_date) };
    return null;
  };

  const doQuickAdd = async () => {
    if (!quickForm.name.trim() || !quickForm.phone.trim()) { toast.error("Name and mobile required"); return; }
    try {
      await quickAdd({ data: { name: quickForm.name.trim(), phone: quickForm.phone.trim() } });
      toast.success("Customer added — welcome message queued");
      setQuickOpen(false); setQuickForm({ name: "", phone: "" });
      qc.invalidateQueries({ queryKey: ["parties"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const doDelete = async (p: PartyRow) => {
    if (!confirm(`Delete customer "${p.name}"? This cannot be undone.`)) return;
    try {
      await removeParty({ data: { id: p.id } });
      toast.success("Customer deleted");
      qc.invalidateQueries({ queryKey: ["parties"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  const doBroadcast = async () => {
    if (!promoMsg.trim()) { toast.error("Enter a message"); return; }
    try {
      const r = await broadcast({ data: { audience: "parties", message: promoMsg.trim() } });
      toast.success(`Promo sent to ${r.sent}/${r.total} customers`);
      setPromoOpen(false); setPromoMsg("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Broadcast failed"); }
  };

  return (
    <>
      <PageHeader
        title="Parties"
        description="Customer master with outstanding balance tracking."
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && <Button variant="outline" onClick={() => setPromoOpen(true)}><Megaphone className="h-4 w-4 mr-1" />Send Promo</Button>}
            {isAdmin && <Button variant="outline" onClick={() => setQuickOpen(true)}><Zap className="h-4 w-4 mr-1" />Quick Add</Button>}
            {canEdit && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New Party</Button>}
          </div>
        }
      />

      <PageBody>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Oldest Unpaid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : parties.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">No parties yet. Click New Party to add one.</TableCell></TableRow>
                ) : parties.map((p) => {
                  const o = outstandingMap.get(p.id);
                  const out = Number(o?.outstanding ?? 0);
                  const block = blockedStatus(o, p.credit_limit);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.contact_person ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.phone ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(Number(p.opening_balance ?? 0))}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{inr(Number(p.current_balance ?? 0))}</TableCell>
                      <TableCell className="text-right">{inr(p.credit_limit)}</TableCell>
                      <TableCell className="text-right font-medium">{inr(out)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(o?.oldest_unpaid_date)}</TableCell>
                      <TableCell>
                        {block ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {block.kind === "limit" ? "Credit Limit" : `Overdue ${block.days}d`}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Print preview"
                            onClick={() => setPreviewUrl(`/print/party-ledger/${p.id}`)}>
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Send statement on WhatsApp"
                            disabled={sendingId === p.id}
                            onClick={() => sendStatement(p)}>
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Message history"
                            onClick={() => setMsgFor(p)}>
                            <MessageCircle className="h-4 w-4 opacity-60" />
                          </Button>
                          {isAdmin && (
                            <Button size="icon" variant="ghost"
                              title={p.promo_opt_in === false ? "Promo opted-out (click to opt in)" : "Opt-out of promos"}
                              onClick={async () => {
                                try {
                                  await setOptIn({ data: { party_kind: "customer", party_id: p.id, promo_opt_in: !(p.promo_opt_in !== false) } });
                                  qc.invalidateQueries({ queryKey: ["parties"] });
                                } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                              }}>
                              <Badge variant={p.promo_opt_in === false ? "secondary" : "default"} className="h-5 px-1 text-[10px]">
                                {p.promo_opt_in === false ? "OFF" : "ON"}
                              </Badge>
                            </Button>
                          )}

                          {canEdit && (
                            <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button size="icon" variant="ghost" title="Delete customer" onClick={() => doDelete(p)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Party" : "New Party"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact Person"><Input value={form.contact_person ?? ""} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></Field>
              <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="GSTIN"><Input value={form.gstin ?? ""} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></Field>
            </div>
            <Field label="Address"><Textarea rows={2} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Credit Limit (₹)"><Input type="number" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opening Balance (₹)"><Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} /></Field>
              <Field label="Closing Balance (₹)"><Input type="number" value={form.current_balance} disabled readOnly /></Field>
            </div>
            <Field label="Notes"><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Quick Add Customer</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Name *"><Input value={quickForm.name} onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })} placeholder="Customer name" /></Field>
            <Field label="Mobile *"><Input value={quickForm.phone} onChange={(e) => setQuickForm({ ...quickForm, phone: e.target.value })} placeholder="10-digit mobile or +91…" /></Field>
            <p className="text-xs text-muted-foreground">A WhatsApp welcome greeting will be sent automatically.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickOpen(false)}>Cancel</Button>
            <Button onClick={doQuickAdd}>Add & Greet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={promoOpen} onOpenChange={setPromoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Send Marketing Promo</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Message"><Textarea rows={4} value={promoMsg} onChange={(e) => setPromoMsg(e.target.value)} placeholder="Your promotional message…" /></Field>
            <p className="text-xs text-muted-foreground">Sent to all customers with WhatsApp opt-in enabled.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoOpen(false)}>Cancel</Button>
            <Button onClick={doBroadcast}>Send Broadcast</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintPreviewModal
        url={previewUrl}
        title="Ledger Preview"
        onClose={() => setPreviewUrl(null)}
      />
      <PartyMessagesDialog
        open={!!msgFor}
        onOpenChange={(v) => !v && setMsgFor(null)}
        party_kind="customer"
        party_id={msgFor?.id ?? null}
        party_name={msgFor?.name ?? ""}
      />
    </>

  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
