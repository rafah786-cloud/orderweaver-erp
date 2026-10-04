import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const db = supabase as any;

export function CompanySwitcher() {
  const { companies, activeCompany, loading, switchCompany, refresh } = useCompany();
  const { hasRole } = useAuth();
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({ code: "", legal_name: "", display_name: "", gstin: "", pan: "", state: "", address: "" });

  if (loading || !activeCompany) return null;

  const createCompany = async () => {
    if (!form.code.trim() || !form.legal_name.trim() || !form.display_name.trim()) {
      toast.error("Code, legal name and display name are required");
      return;
    }
    const { data: company, error } = await db.from("companies").insert({
      code: form.code.trim().toUpperCase(),
      legal_name: form.legal_name.trim(),
      display_name: form.display_name.trim(),
      gstin: form.gstin.trim().toUpperCase() || null,
      pan: form.pan.trim().toUpperCase() || null,
      state: form.state.trim() || null,
      address: form.address.trim() || null,
    }).select("id").single();
    if (error) {
      toast.error(error.message);
      return;
    }
    const { error: accessError } = await db.from("user_company_access").insert({ user_id: (await supabase.auth.getUser()).data.user?.id, company_id: company.id, is_default: false });
    if (accessError) {
      toast.error(accessError.message);
      return;
    }
    toast.success("Company created");
    setOpenCreate(false);
    setForm({ code: "", legal_name: "", display_name: "", gstin: "", pan: "", state: "", address: "" });
    await refresh();
  };

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-9 min-w-[220px] justify-between gap-3 border border-border/60 bg-background/70 px-3">
            <span className="flex min-w-0 items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 text-left">
                <span className="block truncate text-sm font-medium">{activeCompany.display_name}</span>
                <span className="block text-[10px] text-muted-foreground">{activeCompany.code} · {activeCompany.base_currency}</span>
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[340px] p-0">
          <Command>
            <CommandInput placeholder="Search company…" />
            <CommandList>
              <CommandEmpty>No company found.</CommandEmpty>
              <CommandGroup heading="Your companies">
                {companies.map((company) => (
                  <CommandItem
                    key={company.id}
                    value={`${company.display_name} ${company.code}`}
                    onSelect={() => void switchCompany(company.id)}
                    className="py-3"
                  >
                    <Building2 className="mr-2 h-4 w-4" />
                    <span className="flex-1">
                      <span className="block font-medium">{company.display_name}</span>
                      <span className="text-xs text-muted-foreground">{company.code} · {company.base_currency}</span>
                    </span>
                    {company.id === activeCompany.id && <Check className="h-4 w-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {hasRole("admin") && (
            <div className="border-t p-2">
              <Button variant="outline" size="sm" className="w-full" onClick={() => setOpenCreate(true)}>
                <Plus className="mr-2 h-4 w-4" /> Create New Company
              </Button>
            </div>
          )}
          <div className="border-t p-2 text-[11px] text-muted-foreground">
            <Badge variant="secondary" className="mr-1">Active company</Badge>
            Accounting, inventory and transaction data are isolated by company.
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Company</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>Company Code *</Label><Input placeholder="NEWCO" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>Legal Name *</Label><Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} /></div>
            <div><Label>Display Name *</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
            <div><Label>GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
            <div><Label>PAN</Label><Input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} /></div>
            <div><Label>State</Label><Input placeholder="Kerala" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenCreate(false)}>Cancel</Button>
            <Button onClick={() => void createCompany()}>Create Company</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
