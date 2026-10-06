import { useEffect, useState } from "react";
import { Building2, Plus, Save, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const db = supabase as any;

type CompanyForm = {
  code: string;
  legal_name: string;
  display_name: string;
  mailing_name: string;
  address: string;
  state: string;
  gstin: string;
  pan: string;
  base_currency: string;
  currency_symbol: string;
};

const emptyForm: CompanyForm = {
  code: "",
  legal_name: "",
  display_name: "",
  mailing_name: "",
  address: "",
  state: "",
  gstin: "",
  pan: "",
  base_currency: "INR",
  currency_symbol: "₹",
};

export function CompanyManagementCard() {
  const { companies, activeCompany, refresh } = useCompany();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [members, setMembers] = useState<Record<string, number>>({});

  useEffect(() => {
    void (async () => {
      const { data } = await db.from("user_company_access").select("company_id");
      const counts: Record<string, number> = {};
      for (const row of data ?? []) counts[row.company_id] = (counts[row.company_id] ?? 0) + 1;
      setMembers(counts);
    })();
  }, [companies.length]);

  const startEdit = (company: any) => {
    setEditing(company.id);
    setForm({
      code: company.code,
      legal_name: company.legal_name,
      display_name: company.display_name,
      mailing_name: company.mailing_name ?? "",
      address: company.address ?? "",
      state: company.state ?? "",
      gstin: company.gstin ?? "",
      pan: company.pan ?? "",
      base_currency: company.base_currency,
      currency_symbol: company.currency_symbol,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.legal_name.trim() || !form.display_name.trim()) {
      toast.error("Code, legal name and display name are required");
      return;
    }
    const payload = {
      ...form,
      code: form.code.trim().toUpperCase(),
      legal_name: form.legal_name.trim(),
      display_name: form.display_name.trim(),
    };
    const result = editing
      ? await db.from("companies").update(payload).eq("id", editing)
      : await db.from("companies").insert(payload);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(editing ? "Company updated" : "Company created");
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    await refresh();
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Companies
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Maintain separate books, masters and transactions for every legal entity.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setForm(emptyForm);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> New Company
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {companies.map((company) => (
          <div key={company.id} className="rounded-lg border bg-card/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{company.display_name}</div>
                <div className="text-xs text-muted-foreground">
                  {company.code} · {company.base_currency}
                </div>
              </div>
              {company.id === activeCompany?.id && <Badge>Active</Badge>}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> {members[company.id] ?? 0} user
              {members[company.id] === 1 ? "" : "s"}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => startEdit(company)}
            >
              <Save className="mr-2 h-3.5 w-3.5" /> Edit company
            </Button>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Company" : "Create Company"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Company Code *</Label>
              <Input
                value={form.code}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="ABOOD"
              />
            </div>
            <div>
              <Label>Legal Name *</Label>
              <Input
                value={form.legal_name}
                onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Display Name *</Label>
              <Input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Mailing Name</Label>
              <Input
                value={form.mailing_name}
                onChange={(e) => setForm({ ...form, mailing_name: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div>
              <Label>State</Label>
              <Input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                placeholder="Kerala"
              />
            </div>
            <div>
              <Label>GSTIN</Label>
              <Input
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>PAN</Label>
              <Input
                value={form.pan}
                onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>Base Currency</Label>
              <Input
                value={form.base_currency}
                onChange={(e) => setForm({ ...form, base_currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>Currency Symbol</Label>
              <Input
                value={form.currency_symbol}
                onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>Save Company</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
