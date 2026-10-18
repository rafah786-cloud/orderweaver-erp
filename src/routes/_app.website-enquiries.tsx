import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Mail, MessageCircle, Phone, RefreshCw, Search, Inbox } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type WebsiteEnquiry = Database["public"]["Tables"]["website_enquiries"]["Row"];
type EnquiryStatus = "new" | "contacted" | "qualified" | "closed" | "spam";

const statuses: { value: EnquiryStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "closed", label: "Closed" },
  { value: "spam", label: "Spam" },
];

const enquiryLabels: Record<string, string> = {
  general: "General enquiry",
  guidance: "Mattress buying guidance",
  product: "Product enquiry",
  custom: "Custom mattress enquiry",
  business: "Wholesale / hospitality / project",
  warranty: "Warranty / service",
  tracking: "Order tracking",
};

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function statusTone(status: string) {
  if (status === "new") return "default";
  if (status === "qualified") return "secondary";
  if (status === "spam") return "destructive";
  return "outline";
}

export const Route = createFileRoute("/_app/website-enquiries")({
  head: () => ({
    meta: [
      { title: "Website Enquiries | Mattress Maestro ERP" },
      { name: "description", content: "Review and follow up Zizz Mattress website enquiries." },
    ],
  }),
  component: WebsiteEnquiriesPage,
});

function WebsiteEnquiriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["website-enquiries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_enquiries")
        .select("id, reference_number, company_id, customer_name, phone, email, enquiry_type, model_name, message, status, response_notes, assigned_to, source, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return (data ?? []) as WebsiteEnquiry[];
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: EnquiryStatus }) => {
      const { error } = await supabase
        .from("website_enquiries")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
      return { id, status };
    },
    onSuccess: async () => {
      toast.success("Enquiry status updated.");
      await queryClient.invalidateQueries({ queryKey: ["website-enquiries"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update the enquiry."),
  });

  const noteMutation = useMutation({
    mutationFn: async ({ id, response_notes }: { id: string; response_notes: string }) => {
      const { error } = await supabase
        .from("website_enquiries")
        .update({ response_notes: response_notes.trim() || null })
        .eq("id", id);
      if (error) throw error;
      return { id, response_notes };
    },
    onSuccess: async ({ id, response_notes }) => {
      setNoteDrafts((current) => ({ ...current, [id]: response_notes }));
      toast.success("Follow-up note saved.");
      await queryClient.invalidateQueries({ queryKey: ["website-enquiries"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the note."),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const items = query.data ?? [];
    if (!term) return items;
    return items.filter((item) =>
      [
        item.reference_number,
        item.customer_name,
        item.phone,
        item.email ?? "",
        item.enquiry_type,
        item.model_name ?? "",
        item.message,
        item.status,
      ].some((value) => value.toLowerCase().includes(term)),
    );
  }, [query.data, search]);

  const newCount = (query.data ?? []).filter((item) => item.status === "new").length;

  return (
    <div>
      <PageHeader
        title="Website Enquiries"
        description="Customer enquiries submitted through the Zizz Mattress website. Follow up from this inbox; website submissions do not create sales orders."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={"mr-1.5 h-4 w-4 " + (query.isFetching ? "animate-spin" : "")} />
            Refresh
          </Button>
        }
      />
      <PageBody>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <label className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Search website enquiries</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              placeholder="Search reference, name, phone, model or message…"
            />
          </label>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {newCount} new · {rows.length} shown of {query.data?.length ?? 0} loaded
          </p>
        </div>

        {query.isLoading ? (
          <Card><CardContent className="p-8 text-sm text-muted-foreground">Loading website enquiries…</CardContent></Card>
        ) : query.error ? (
          <Card><CardContent className="p-8">
            <p className="font-medium">The website-enquiry inbox could not be loaded.</p>
            <p className="mt-2 text-sm text-muted-foreground">Check that the website-enquiry migration is applied and that your account has Admin or Sales access in the active company.</p>
            <Button className="mt-4" variant="outline" onClick={() => query.refetch()}>Try again</Button>
          </CardContent></Card>
        ) : rows.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center p-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">{query.data?.length ? "No matching enquiries" : "No website enquiries yet"}</h2>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">{query.data?.length ? "Try a shorter search term or clear the search." : "Once a visitor submits the Zizz Mattress contact form, the enquiry and reference number will appear here."}</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {rows.map((item) => {
              const note = noteDrafts[item.id] ?? item.response_notes ?? "";
              const whatsappNumber = item.phone.replace(/\D/g, "");
              return (
                <Card key={item.id}>
                  <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{item.customer_name}</CardTitle>
                        <Badge variant={statusTone(item.status) as "default" | "secondary" | "destructive" | "outline"}>{statuses.find((option) => option.value === item.status)?.label ?? item.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.reference_number} · {dateLabel(item.created_at)}</p>
                      <p className="mt-2 text-sm font-medium">{enquiryLabels[item.enquiry_type] ?? item.enquiry_type}{item.model_name ? " · " + item.model_name : ""}</p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <select
                        value={item.status}
                        disabled={statusMutation.isPending}
                        onChange={(event) => statusMutation.mutate({ id: item.id, status: event.target.value as EnquiryStatus })}
                        className="rounded-md border bg-background px-2.5 py-2 text-sm"
                        aria-label={"Update status for " + item.reference_number}
                      >
                        {statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <p className="flex items-start gap-2 break-all"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{item.phone}</p>
                      <p className="flex items-start gap-2 break-all"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{item.email || "No email supplied"}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.message || "No message provided."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={"tel:" + item.phone} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"><Phone className="h-4 w-4" /> Call</a>
                      <a href={"https://wa.me/" + whatsappNumber} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
                      {item.email && <a href={"mailto:" + item.email + "?subject=" + encodeURIComponent("Zizz Mattress enquiry " + item.reference_number)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"><Mail className="h-4 w-4" /> Email</a>}
                    </div>
                    <div className="border-t pt-3">
                      <label className="block text-sm font-medium">Internal follow-up note
                        <Textarea
                          value={note}
                          onChange={(event) => setNoteDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                          maxLength={4000}
                          rows={2}
                          placeholder="Record the response, next action, or customer requirement for the sales team…"
                          className="mt-1.5"
                        />
                      </label>
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={noteMutation.isPending || note.trim() === (item.response_notes ?? "")}
                          onClick={() => noteMutation.mutate({ id: item.id, response_notes: note })}
                        >Save follow-up note</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </PageBody>
    </div>
  );
}
