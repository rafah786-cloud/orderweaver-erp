import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ReferenceInvoice } from "@/components/print/ReferenceInvoice";

export const Route = createFileRoute("/_app/print/invoice/$id")({
  component: PrintInvoice,
});

function PrintInvoice() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["print-invoice", id],
    queryFn: async () => {
      const { data: inv, error: e1 } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .single();
      if (e1) throw e1;
      const { data: items, error: e2 } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", id);
      if (e2) throw e2;
      const { data: party, error: e3 } = await supabase
        .from("parties")
        .select("name, address, gstin, phone, email, state_code, pin_code, contact_person")
        .eq("id", inv.party_id)
        .single();
      if (e3) throw e3;
      return { inv, items: items ?? [], party };
    },
  });

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (error || !data)
    return <div className="p-10 text-center text-destructive">Invoice not found.</div>;

  return <ReferenceInvoice invoice={data.inv} items={data.items} party={data.party} />;
}
