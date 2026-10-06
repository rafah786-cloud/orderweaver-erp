import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Company = {
  id: string;
  code: string;
  legal_name: string;
  display_name: string;
  mailing_name: string | null;
  address: string | null;
  state: string | null;
  country: string;
  gstin: string | null;
  pan: string | null;
  base_currency: string;
  currency_symbol: string;
  is_active: boolean;
};

type CompanyContextValue = {
  companies: Company[];
  activeCompany: Company | null;
  loading: boolean;
  switchCompany: (companyId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

// The generated Supabase types are refreshed separately from this migration.
// Keep this boundary typed locally so the UI remains buildable before regeneration.
const db = supabase as any;

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [
        { data: profile, error: profileError },
        { data: memberships, error: membershipError },
      ] = await Promise.all([
        db.from("profiles").select("active_company_id").maybeSingle(),
        db.from("user_company_access").select("company_id").eq("can_view", true),
      ]);
      if (profileError) throw profileError;
      if (membershipError) throw membershipError;

      const ids = (memberships ?? []).map((m: { company_id: string }) => m.company_id);
      if (!ids.length) {
        setCompanies([]);
        setActiveCompany(null);
        return;
      }

      const { data, error } = await db
        .from("companies")
        .select(
          "id, code, legal_name, display_name, mailing_name, address, state, country, gstin, pan, base_currency, currency_symbol, is_active",
        )
        .in("id", ids)
        .eq("is_active", true)
        .order("display_name");
      if (error) throw error;

      const list = (data ?? []) as Company[];
      setCompanies(list);
      setActiveCompany(list.find((c) => c.id === profile?.active_company_id) ?? list[0] ?? null);

      // Self-heal older users whose profile predates multi-company support.
      const fallback = list.find((c) => c.id === profile?.active_company_id) ?? list[0];
      if (fallback && fallback.id !== profile?.active_company_id) {
        await db.rpc("set_active_company", { _company_id: fallback.id });
      }
    } catch (error) {
      console.error("Company context load failed", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const switchCompany = async (companyId: string) => {
    const target = companies.find((c) => c.id === companyId);
    if (!target) return;
    const { error } = await db.rpc("set_active_company", { _company_id: companyId });
    if (error) {
      toast.error(error.message || "Could not switch company");
      return;
    }
    setActiveCompany(target);
    // Company is a data boundary. Invalidate by reloading so every cached query
    // is guaranteed to run under the new active-company context.
    window.location.reload();
  };

  const value = useMemo(
    () => ({ companies, activeCompany, loading, switchCompany, refresh }),
    [companies, activeCompany, loading],
  );
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const value = useContext(CompanyContext);
  if (!value) throw new Error("useCompany must be used inside CompanyProvider");
  return value;
}
