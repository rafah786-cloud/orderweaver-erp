import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Company = {
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

// Generated Supabase types are refreshed separately from database migrations.
const db = supabase as any;

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) {
        setCompanies([]);
        setActiveCompany(null);
        return;
      }

      const [
        { data: profileRow, error: profileError },
        { data: memberships, error: membershipError },
      ] = await Promise.all([
        db.from("profiles").select("active_company_id").eq("id", userId).maybeSingle(),
        db
          .from("user_company_access")
          .select("company_id")
          .eq("user_id", userId)
          .eq("can_view", true),
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
      const active = list.find((c) => c.id === profileRow?.active_company_id) ?? list[0] ?? null;
      setCompanies(list);
      setActiveCompany(active);

      const fallback = list[0];
      if (fallback && fallback.id !== profileRow?.active_company_id) {
        await db.rpc("set_active_company", { _company_id: fallback.id });
      }
    } catch (error) {
      console.error("Company context load failed", error);
      toast.error("Could not load your company access. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const switchCompany = async (companyId: string) => {
    const target = companies.find((company) => company.id === companyId);
    if (!target || target.id === activeCompany?.id) return;

    const { error } = await db.rpc("set_active_company", { _company_id: companyId });
    if (error) {
      toast.error(error.message || "Could not switch company");
      return;
    }

    setActiveCompany(target);
    toast.success("Switched to " + target.display_name);
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
