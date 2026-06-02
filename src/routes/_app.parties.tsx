import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, AlertTriangle, Printer } from "lucide-react";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { toast } from "sonner";
import { inr, daysBetween, formatDate } from "@/lib/format";

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
};

function PartiesPage() {
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "sales"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PartyRow | null>(null);
  const [form, setForm] = useState<Omit<PartyRow, "id">>(empty);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: parties = [], isLoading } = useQuery({
    queryKey: ["parties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id, name, contact_person, phone, email, address, gstin, credit_limit, notes")
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
        ...form,
        credit_limit: Number(form.credit_limit) || 0,
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

  return (
    <>
      <PageHeader
        title="Parties"
        description="Customer master with outstanding balance tracking."
        actions={canEdit ? <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New Party</Button> : undefined}
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
                  <TableHead className="text-right">Credit Limit</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Oldest Unpaid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : parties.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No parties yet. Click New Party to add one.</TableCell></TableRow>
                ) : parties.map((p) => {
                  const o = outstandingMap.get(p.id);
                  const out = Number(o?.outstanding ?? 0);
                  const block = blockedStatus(o, p.credit_limit);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.contact_person ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.phone ?? "—"}</TableCell>
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
                          {canEdit && (
                            <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                              <Pencil className="h-4 w-4" />
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
            <Field label="Notes"><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
