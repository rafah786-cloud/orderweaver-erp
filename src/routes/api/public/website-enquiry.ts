import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeZizzEnquiryPhone, WebsiteEnquirySchema } from "@/lib/zizz-website-enquiry";

function jsonError(message: string, status: number) {
  return Response.json({ ok: false, error: message }, { status });
}

export const Route = createFileRoute("/api/public/website-enquiry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return jsonError("Send the enquiry as JSON.", 415);
        }

        let rawBody = "";
        try {
          rawBody = await request.text();
        } catch {
          return jsonError("Unable to read the enquiry.", 400);
        }
        if (rawBody.length > 12_000) return jsonError("The enquiry is too large.", 413);

        let body: unknown;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return jsonError("The enquiry was not valid JSON.", 400);
        }
        const parsed = WebsiteEnquirySchema.safeParse(body);
        if (!parsed.success) {
          return jsonError("Check the name, phone number and enquiry details, then try again.", 400);
        }

        const input = parsed.data;
        // Honeypot field: silently accept bot traffic without creating an ERP record.
        if (input.companyWebsite.trim()) {
          return Response.json({ ok: true, referenceNumber: null });
        }

        const phone = normalizeZizzEnquiryPhone(input.phone);
        if (!phone) {
          return jsonError("Enter a valid mobile/telephone number, including the country code if outside India.", 400);
        }
        const email = input.email.trim();
        if (email && !z.string().email().max(255).safeParse(email).success) {
          return jsonError("Enter a valid email address or leave it blank.", 400);
        }

        const { data: company, error: companyError } = await supabaseAdmin
          .from("companies")
          .select("id")
          .eq("code", "ABOOD")
          .eq("is_active", true)
          .maybeSingle();

        if (companyError || !company) {
          console.error("[website-enquiry] Abood company could not be resolved");
          return jsonError("Enquiry submission is temporarily unavailable. Please use the direct customer-care links.", 503);
        }

        // Limit repeated submissions from the same contact details without storing an IP address.
        const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: recent, error: rateLimitError } = await supabaseAdmin
          .from("website_enquiries")
          .select("id")
          .eq("company_id", company.id)
          .eq("phone", phone)
          .gte("created_at", since)
          .limit(3);

        if (rateLimitError) {
          console.error("[website-enquiry] Rate-limit query failed");
          return jsonError("Enquiry submission is temporarily unavailable. Please use the direct customer-care links.", 503);
        }
        if ((recent ?? []).length >= 3) {
          return jsonError("Several requests were received from this number recently. Please wait a little or contact customer care directly.", 429);
        }

        const message = input.message.trim() || "Please contact me about my enquiry.";
        const modelName = input.model.trim() || null;
        const { data: enquiry, error: insertError } = await supabaseAdmin
          .from("website_enquiries")
          .insert({
            company_id: company.id,
            customer_name: input.name.trim(),
            phone,
            email: email || null,
            enquiry_type: input.type,
            model_name: modelName,
            message,
            source: "zizz_website",
          })
          .select("id, reference_number")
          .single();

        if (insertError || !enquiry) {
          // Do not log the submitted name, phone, email or message.
          console.error("[website-enquiry] Enquiry insert failed");
          return jsonError("We could not record your enquiry just now. Please use the direct customer-care links.", 503);
        }

        // Notify only approved Admin/Sales users who can view this company.
        // Notification failure must never discard a successfully recorded enquiry.
        try {
          const { data: accessRows } = await supabaseAdmin
            .from("user_company_access")
            .select("user_id")
            .eq("company_id", company.id)
            .eq("can_view", true);
          const candidateIds = [...new Set((accessRows ?? []).map((row) => row.user_id))];
          if (candidateIds.length > 0) {
            const [{ data: roleRows }, { data: profiles }] = await Promise.all([
              supabaseAdmin
                .from("user_roles")
                .select("user_id, role")
                .in("user_id", candidateIds)
                .in("role", ["admin", "sales"]),
              supabaseAdmin
                .from("profiles")
                .select("id")
                .in("id", candidateIds)
                .eq("status", "approved"),
            ]);
            const approvedIds = new Set((profiles ?? []).map((profile) => profile.id));
            const userIds = [...new Set((roleRows ?? [])
              .filter((row) => approvedIds.has(row.user_id))
              .map((row) => row.user_id))];
            if (userIds.length > 0) {
              const { dispatchNotificationEvent } = await import("@/lib/notifications/engine.server");
              await dispatchNotificationEvent({
                eventKey: "website.enquiry.created",
                recipients: { userIds },
                variables: {
                  reference_number: enquiry.reference_number,
                  customer_name: input.name.trim(),
                  enquiry_type: input.type,
                  model_name: modelName ?? "Not specified",
                },
                context: {
                  party_kind: "staff",
                  party_id: null,
                  ref_table: "website_enquiries",
                  ref_id: enquiry.id,
                  payload: { source: "zizz_website" },
                },
              });
            }
          }
        } catch {
          console.error("[website-enquiry] Notification dispatch failed");
        }

        return Response.json({ ok: true, referenceNumber: enquiry.reference_number });
      },
    },
  },
});
