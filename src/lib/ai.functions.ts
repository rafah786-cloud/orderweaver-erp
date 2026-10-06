import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Server functions for the AI Intelligence layer.
 *
 * Rules enforced here:
 *  - every call is authenticated and role-checked;
 *  - all data access uses the caller's RLS-scoped client;
 *  - AI can read, analyse and propose — it never writes ERP transactions.
 */

const ANALYST_ROLES: AppRole[] = ["admin", "accountant", "sales", "production"];

async function rolesOf(supabase: any): Promise<AppRole[]> {
  const { data } = await supabase.rpc("current_user_roles");
  return ((data ?? []) as { role?: AppRole }[] | AppRole[]).map((r) =>
    typeof r === "string" ? r : (r.role as AppRole),
  );
}

async function assertRole(supabase: any, allowed: AppRole[] = ANALYST_ROLES): Promise<AppRole[]> {
  const roles = await rolesOf(supabase);
  if (!roles.some((r) => allowed.includes(r))) {
    throw new Error("You do not have permission to use this AI feature.");
  }
  return roles;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "The AI service is temporarily unavailable.";
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export const getAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAiConfigured, AI_MODELS } = await import("@/lib/ai/nvidia.server");
    const roles = await rolesOf(context.supabase);
    return {
      configured: isAiConfigured(),
      models: { chat: AI_MODELS.chat, vision: AI_MODELS.vision, embedding: AI_MODELS.embedding },
      canUseAi: roles.some((r) => ANALYST_ROLES.includes(r)),
    };
  });

/* ------------------------------------------------------------------ */
/* Ask Mattress Maestro                                                */
/* ------------------------------------------------------------------ */

export const askMaestroFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z.string().min(2).max(1000),
        conversationId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase);
    const started = Date.now();
    const { askMaestro } = await import("@/lib/ai/assistant.server");
    const { logAiUsage } = await import("@/lib/ai/audit.server");

    let conversationId = data.conversationId ?? null;
    if (!conversationId) {
      const { data: conv } = await context.supabase
        .from("ai_conversations")
        .insert({ user_id: context.userId, title: data.question.slice(0, 80) })
        .select("id")
        .single();
      conversationId = conv?.id ?? null;
    }

    const { data: prior } = conversationId
      ? await context.supabase
          .from("ai_messages")
          .select("role, content")
          .eq("conversation_id", conversationId)
          .order("created_at")
          .limit(8)
      : { data: [] };

    try {
      const result = await askMaestro(
        context.supabase,
        data.question,
        (prior ?? []).map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      );

      if (conversationId) {
        await context.supabase.from("ai_messages").insert([
          {
            conversation_id: conversationId,
            user_id: context.userId,
            role: "user",
            content: data.question,
          },
          {
            conversation_id: conversationId,
            user_id: context.userId,
            role: "assistant",
            content: result.answer,
            data: { retrievers: result.usedRetrievers } as never,
          },
        ]);
      }

      await logAiUsage({
        userId: context.userId,
        feature: "ask_maestro",
        model: result.model,
        promptSummary: data.question,
        durationMs: Date.now() - started,
        meta: { retrievers: result.usedRetrievers },
      });

      return {
        ok: true as const,
        conversationId,
        ...result,
        evidence: result.evidence as Json,
        error: null as string | null,
      };
    } catch (e) {
      await logAiUsage({
        userId: context.userId,
        feature: "ask_maestro",
        status: "error",
        error: errorMessage(e),
        promptSummary: data.question,
        durationMs: Date.now() - started,
      });
      return {
        ok: false as const,
        conversationId,
        answer: "",
        usedRetrievers: [] as string[],
        evidence: {} as Json,
        model: "",
        error: errorMessage(e),
      };
    }
  });

export const listAiConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(25);
    return data ?? [];
  });

export const getAiConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: messages } = await context.supabase
      .from("ai_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at");
    return messages ?? [];
  });

/* ------------------------------------------------------------------ */
/* Metrics (deterministic — no AI call)                                */
/* ------------------------------------------------------------------ */

const metricsInput = z.object({
  topic: z.enum([
    "sales",
    "profitability",
    "customers",
    "inventory",
    "production",
    "receivables",
    "suppliers",
    "monthly",
    "forecast",
    "anomalies",
  ]),
  days: z.number().int().min(7).max(1095).optional(),
});

export const getErpMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => metricsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase);
    const m = await import("@/lib/ai/erp-data.server");
    const db = context.supabase;
    const days = data.days ?? 90;
    switch (data.topic) {
      case "sales":
        return { topic: data.topic, data: await m.salesSummary(db, m.defaultPeriod(days)) };
      case "profitability":
        return { topic: data.topic, data: await m.productProfitability(db, m.defaultPeriod(days)) };
      case "customers":
        return {
          topic: data.topic,
          data: await m.customerProfitability(db, m.defaultPeriod(days)),
        };
      case "inventory":
        return { topic: data.topic, data: await m.inventoryIntelligence(db, days) };
      case "production":
        return { topic: data.topic, data: await m.productionIntelligence(db, days) };
      case "receivables":
        return { topic: data.topic, data: await m.receivables(db) };
      case "suppliers":
        return { topic: data.topic, data: await m.supplierPricing(db, Math.max(days, 180)) };
      case "monthly":
        return { topic: data.topic, data: await m.monthlySeries(db, 12) };
      case "forecast":
        return { topic: data.topic, data: await m.forecasts(db, 3) };
      case "anomalies":
      default:
        return { topic: data.topic, data: await m.detectAnomalies(db) };
    }
  });

/* ------------------------------------------------------------------ */
/* Management brief (cached)                                           */
/* ------------------------------------------------------------------ */

const BRIEF_TTL_MS = 6 * 60 * 60 * 1000;

export const getBusinessBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ refresh: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase);
    const started = Date.now();
    const { businessSnapshot } = await import("@/lib/ai/erp-data.server");
    const { logAiUsage } = await import("@/lib/ai/audit.server");
    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");

    if (!data.refresh) {
      const { data: cached } = await context.supabase
        .from("ai_insights")
        .select("payload, generated_at, expires_at, model")
        .eq("kind", "business_brief")
.eq("company_id", companyId)
        .maybeSingle();
      if (cached?.payload && cached.expires_at && new Date(cached.expires_at) > new Date()) {
        return {
          ...(cached.payload as Record<string, unknown>),
          cached: true,
          generatedAt: cached.generated_at,
        };
      }
    }

    const snapshot = await businessSnapshot(context.supabase);

    let narrative = "";
    let model = "";
    let aiError: string | null = null;
    try {
      const { aiChat } = await import("@/lib/ai/nvidia.server");
      const res = await aiChat(
        [
          {
            role: "system",
            content:
              "You write the daily management brief for a mattress manufacturer's ERP. Use ONLY the supplied figures. " +
              "Structure it in markdown with sections: Sales, Profitability, Inventory, Production, Receivables, Suppliers, and 'What to attend to today'. " +
              "For each point, tag the nature of the statement in square brackets: [Actual], [Calculated], [Forecast], [Interpretation] or [Recommendation]. " +
              "Money in ₹ with Indian digit grouping. No invented figures. Under 450 words.",
          },
          { role: "user", content: JSON.stringify(snapshot).slice(0, 55_000) },
        ],
        { maxTokens: 1600, temperature: 0.2 },
      );
      narrative = res.text;
      model = res.model;
    } catch (e) {
      aiError = errorMessage(e);
    }

    const payload = { snapshot, narrative, aiError, generatedAt: new Date().toISOString() };

    await context.supabase.from("ai_insights").upsert(
      {
        kind: "business_brief",
        company_id: companyId,
        scope_key: "global",
        payload: payload as never,
        model: model || null,
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + BRIEF_TTL_MS).toISOString(),
        created_by: context.userId,
      },
      { onConflict: "kind,scope_key,company_id" },
    );

    await logAiUsage({
      userId: context.userId,
      feature: "business_brief",
      model,
      status: aiError ? "error" : "ok",
      error: aiError,
      durationMs: Date.now() - started,
    });

    return { ...payload, cached: false };
  });

/* ------------------------------------------------------------------ */
/* Contextual AI inside existing screens                               */
/* ------------------------------------------------------------------ */

export const getContextualInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        topic: z.enum([
          "sales",
          "profitability",
          "inventory",
          "production",
          "receivables",
          "suppliers",
        ]),
        focus: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase);
    const started = Date.now();
    const { contextualAnalysis } = await import("@/lib/ai/assistant.server");
    const { logAiUsage } = await import("@/lib/ai/audit.server");
    try {
      const result = await contextualAnalysis(context.supabase, data.topic, data.focus);
      await logAiUsage({
        userId: context.userId,
        feature: `contextual_${data.topic}`,
        model: result.model,
        promptSummary: data.focus ?? data.topic,
        durationMs: Date.now() - started,
      });
      return {
        ok: true as const,
        answer: result.answer,
        evidence: result.evidence as Json,
        error: null as string | null,
      };
    } catch (e) {
      await logAiUsage({
        userId: context.userId,
        feature: `contextual_${data.topic}`,
        status: "error",
        error: errorMessage(e),
        durationMs: Date.now() - started,
      });
      return { ok: false as const, answer: "", evidence: {} as Json, error: errorMessage(e) };
    }
  });

/* ------------------------------------------------------------------ */
/* Natural-language ERP search (controlled query layer)                */
/* ------------------------------------------------------------------ */

export const naturalLanguageSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ question: z.string().min(2).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase);
    const started = Date.now();
    const { aiChatJson, AI_MODELS } = await import("@/lib/ai/nvidia.server");
    const { describeEntities, runControlledQuery } = await import("@/lib/ai/query-layer.server");
    const { logAiUsage } = await import("@/lib/ai/audit.server");

    try {
      const spec = await aiChatJson<Record<string, unknown>>(
        [
          {
            role: "system",
            content:
              "Translate the user's request into a JSON query spec for an ERP search API. You cannot write SQL. " +
              `Entities and filterable columns:\n${describeEntities()}\n` +
              "Operators: eq, neq, gt, gte, lt, lte, ilike, in, is_null, not_null. Dates ISO yyyy-mm-dd. " +
              'Reply as {"entity":"...","filters":[{"column":"...","op":"...","value":...}],"orderBy":"...","ascending":false,"limit":50,"explanation":"one sentence"}. ' +
              "Amounts are in rupees; 1 lakh = 100000, 1 crore = 10000000.",
          },
          {
            role: "user",
            content: `Today is ${new Date().toISOString().slice(0, 10)}. Request: ${data.question}`,
          },
        ],
        { model: AI_MODELS.fast, maxTokens: 400, temperature: 0 },
      );

      const result = await runControlledQuery(context.supabase, spec);
      await logAiUsage({
        userId: context.userId,
        feature: "nl_search",
        model: AI_MODELS.fast,
        promptSummary: data.question,
        durationMs: Date.now() - started,
        meta: { entity: result.entity, rows: result.rowCount },
      });
      return {
        ok: true as const,
        ...result,
        spec: result.spec as unknown as Json,
        rows: result.rows as Json[],
        error: null as string | null,
      };
    } catch (e) {
      await logAiUsage({
        userId: context.userId,
        feature: "nl_search",
        status: "error",
        error: errorMessage(e),
        promptSummary: data.question,
        durationMs: Date.now() - started,
      });
      return {
        ok: false as const,
        entity: "",
        label: "",
        spec: null as Json | null,
        rows: [] as Json[],
        rowCount: 0,
        truncated: false,
        error: errorMessage(e),
      };
    }
  });

/* ------------------------------------------------------------------ */
/* Documents: read, match, index, search                               */
/* ------------------------------------------------------------------ */

const DOC_KINDS = [
  "purchase_invoice",
  "sales_invoice",
  "quotation",
  "purchase_order",
  "delivery_challan",
  "specification",
  "other",
] as const;

export const analyzeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(1).max(200),
        docKind: z.enum(DOC_KINDS).default("other"),
        fileName: z.string().max(300).optional(),
        mimeType: z.string().max(120).optional(),
        text: z.string().max(200_000).optional(),
        imageDataUrl: z.string().max(12_000_000).optional(),
        quotationGroup: z.string().max(120).nullable().optional(),
      })
      .refine((v) => Boolean(v.text?.trim() || v.imageDataUrl), {
        message: "Provide either document text or an image of the document.",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase);
    const started = Date.now();
    const { extractDocument, matchExtraction, indexDocument } =
      await import("@/lib/ai/documents.server");
    const { logAiUsage } = await import("@/lib/ai/audit.server");

    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");

    const { data: created, error: insertError } = await context.supabase
      .from("ai_documents")
      .insert({
        company_id: companyId,
        title: data.title,
        doc_kind: data.docKind,
        file_name: data.fileName ?? null,
        mime_type: data.mimeType ?? null,
        content_text: data.text ?? null,
        extraction_status: "processing",
        quotation_group: data.quotationGroup ?? null,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (insertError || !created)
      throw new Error(insertError?.message ?? "Could not save the document.");

    try {
      const extraction = await extractDocument({
        text: data.text,
        imageDataUrl: data.imageDataUrl,
        hint: data.docKind,
      });
      const matches = await matchExtraction(context.supabase, extraction);

      const supplierId =
        matches.supplier[0] && matches.supplier[0].score >= 0.7 ? matches.supplier[0].id : null;
      const partyId =
        matches.customer[0] && matches.customer[0].score >= 0.7 ? matches.customer[0].id : null;

      await context.supabase
        .from("ai_documents")
        .update({
          extraction: { extraction, matches } as never,
          extraction_status: "ready",
          extraction_error: null,
          supplier_id: supplierId,
          party_id: partyId,
          doc_kind:
            extraction.doc_kind && DOC_KINDS.includes(extraction.doc_kind as never)
              ? extraction.doc_kind
              : data.docKind,
        })
        .eq("id", created.id);

      const indexText = data.text?.trim()
        ? data.text
        : `${data.title}\n${JSON.stringify(extraction)}`;
      let chunks = 0;
      try {
        chunks = await indexDocument(context.supabase, created.id, indexText);
      } catch {
        chunks = 0;
      }

      await logAiUsage({
        userId: context.userId,
        feature: "document_reader",
        action: "extract",
        promptSummary: data.title,
        durationMs: Date.now() - started,
        refTable: "ai_documents",
        refId: created.id,
        meta: { chunks, lines: extraction.lines?.length ?? 0 },
      });

      return {
        ok: true as const,
        documentId: created.id,
        extraction: extraction as unknown as Json,
        matches: matches as unknown as Json,
        indexedChunks: chunks,
        error: null as string | null,
      };
    } catch (e) {
      const message = errorMessage(e);
      await context.supabase
        .from("ai_documents")
        .update({ extraction_status: "failed", extraction_error: message })
        .eq("id", created.id);
      await logAiUsage({
        userId: context.userId,
        feature: "document_reader",
        action: "extract",
        status: "error",
        error: message,
        refTable: "ai_documents",
        refId: created.id,
        durationMs: Date.now() - started,
      });
      return {
        ok: false as const,
        documentId: created.id,
        extraction: null as Json | null,
        matches: null as Json | null,
        indexedChunks: 0,
        error: message,
      };
    }
  });

export const listAiDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase);
    const { data, error } = await context.supabase
      .from("ai_documents")
      .select(
        "id, title, doc_kind, file_name, extraction_status, extraction_error, quotation_group, created_at, suppliers(name), parties(name)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getAiDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase);
    const { data: doc, error } = await context.supabase
      .from("ai_documents")
      .select(
        "id, title, doc_kind, file_name, content_text, extraction, extraction_status, extraction_error, created_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return doc;
  });

export const deleteAiDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase);
    const { error } = await context.supabase.from("ai_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const searchDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().min(2).max(300),
        supplierId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase);
    const { semanticSearch } = await import("@/lib/ai/documents.server");
    try {
      const hits = await semanticSearch(context.supabase, data.query, 10, data.supplierId ?? null);
      return { ok: true as const, hits, error: null as string | null };
    } catch (e) {
      return { ok: false as const, hits: [], error: errorMessage(e) };
    }
  });

/* ------------------------------------------------------------------ */
/* Supplier quotation comparison                                       */
/* ------------------------------------------------------------------ */

export const compareQuotationDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ documentIds: z.array(z.string().uuid()).min(2).max(6) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase);
    const started = Date.now();
    const { compareQuotations } = await import("@/lib/ai/documents.server");
    const { logAiUsage } = await import("@/lib/ai/audit.server");

    const { data: docs, error } = await context.supabase
      .from("ai_documents")
      .select("id, title, extraction, suppliers(name)")
      .in("id", data.documentIds);
    if (error) throw new Error(error.message);

    const quotes = (docs ?? [])
      .map((d) => {
        const payload = d.extraction as { extraction?: { supplier_name?: string | null } } | null;
        const extraction = payload?.extraction;
        if (!extraction) return null;
        const supplierRef = d.suppliers as { name?: string } | null;
        return {
          supplier: supplierRef?.name ?? extraction.supplier_name ?? d.title,

          extraction: extraction as any,
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null);

    if (quotes.length < 2) {
      return {
        ok: false as const,
        comparison: null as Json | null,
        error: "Select at least two documents that have been read successfully.",
      };
    }

    try {
      const comparison = await compareQuotations(context.supabase, quotes);
      await logAiUsage({
        userId: context.userId,
        feature: "quotation_comparison",
        durationMs: Date.now() - started,
        meta: { documents: quotes.length },
      });
      return {
        ok: true as const,
        comparison: comparison as unknown as Json,
        error: null as string | null,
      };
    } catch (e) {
      return { ok: false as const, comparison: null as Json | null, error: errorMessage(e) };
    }
  });

/* ------------------------------------------------------------------ */
/* Proposals: AI suggestion -> human confirmation -> audit             */
/* ------------------------------------------------------------------ */

export const createAiProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.string().min(2).max(60),
        summary: z.string().min(2).max(400),
        payload: z.record(z.string(), z.unknown()),
        sourceDocumentId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase);
    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");

    if (data.sourceDocumentId) {
      const { data: sourceDoc, error: sourceError } = await context.supabase
        .from("ai_documents")
        .select("id")
        .eq("id", data.sourceDocumentId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (sourceError || !sourceDoc) {
        throw new Error("Source document is not visible in the active company");
      }
    }

    const { data: row, error } = await context.supabase
      .from("ai_proposals")
      .insert({
        kind: data.kind,
        summary: data.summary,
        payload: data.payload as never,
        source_document_id: data.sourceDocumentId ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { logAiUsage } = await import("@/lib/ai/audit.server");
    await logAiUsage({
      userId: context.userId,
      feature: "proposal",
      action: "create",
      promptSummary: data.summary,
      refTable: "ai_proposals",
      refId: row.id,
    });
    return { ok: true as const, id: row.id };
  });

export const listAiProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_proposals")
      .select(
        "id, kind, summary, payload, status, created_at, reviewed_at, review_note, source_document_id",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Review an AI proposal. Approving records the human decision and audits it —
 * it deliberately does NOT post accounting entries, move stock, change BOQs or
 * prices. The confirmed values are handed back so the user can complete the
 * action in the normal ERP screen, where the existing permissions and
 * validations apply.
 */
export const reviewAiProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, ["admin"]);
    const { data: row, error } = await context.supabase
      .from("ai_proposals")
      .update({
        status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note ?? null,
      })
      .eq("id", data.id)
      .select("id, kind, payload, status")
      .single();
    if (error) throw new Error(error.message);
    const { logAiUsage } = await import("@/lib/ai/audit.server");
    await logAiUsage({
      userId: context.userId,
      feature: "proposal",
      action: data.decision,
      refTable: "ai_proposals",
      refId: data.id,
      meta: { kind: row.kind },
    });
    return { ok: true as const, proposal: row };
  });

export const listAiAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, ["admin"]);
    const { data, error } = await context.supabase
      .from("ai_audit_log")
      .select("id, feature, action, model, status, error, duration_ms, prompt_summary, created_at")
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
