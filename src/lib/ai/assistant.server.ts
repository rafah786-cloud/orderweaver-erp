import { aiChat, aiChatJson, AI_MODELS } from "./nvidia.server";
import {
  businessSnapshot,
  customerProfitability,
  defaultPeriod,
  detectAnomalies,
  forecasts,
  inventoryIntelligence,
  monthlySeries,
  productProfitability,
  productionIntelligence,
  receivables,
  salesSummary,
  supplierPricing,
  type Db,
  type Period,
} from "./erp-data.server";
import { describeEntities, runControlledQuery } from "./query-layer.server";
import { semanticSearch } from "./documents.server";
import { todayIndia } from "@/lib/format";
import { mattressBudgetRecommendations } from "./mattress-recommendation.server";

/**
 * "Ask Mattress Maestro" — a retrieval-first assistant.
 *
 * The model never touches the database. It picks from a fixed catalogue of
 * deterministic ERP retrievers; this module executes them; the model then
 * explains only the figures it was handed. It cannot write, delete or post
 * anything.
 */

const TOOL_CATALOGUE = `
- sales_summary(days): revenue, invoice counts, month-by-month trend, top customers, change vs the previous window.
- product_profitability(days): per-product revenue, average selling price vs list price, BOQ material cost, gross margin.
- customer_profitability(days): revenue and margin by customer.
- receivables(): outstanding invoices, ageing buckets, overdue list.
- inventory(days): stock levels, consumption, days of cover, fast/slow moving, stock-out risk, overstock.
- production(days): production order counts and statuses, cycle time, expected vs actual material consumption, wastage.
- supplier_pricing(days): purchase rate changes per material, supplier spend.
- monthly_series(months): monthly revenue, purchase cost, gross profit and margin.
- forecasts(): statistical forecasts for revenue, gross profit and material requirements.
- anomalies(): unusual changes detected across sales, margins, inventory, production, receivables and supplier prices.
- business_snapshot(): everything above condensed — use for broad "what should I look at" questions.
- erp_query(spec): look up individual records through the controlled query layer.
- document_search(query): semantic search over uploaded business documents.
- mattress_budget_recommendations(budget, limit, stockOnly, preferInStock): recommend existing mattress product models under a customer budget using real ERP BOQs, current raw-material stock and recorded purchase/standard costs. Never invent a model, BOM, quantity or cost.
`;

export interface PlanStep {
  tool: string;
  args?: Record<string, unknown>;
}

export class AiRetrievalError extends Error {}

async function planTools(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<PlanStep[]> {
  const plan = await aiChatJson<{ steps?: PlanStep[] }>(
    [
      {
        role: "system",
        content:
          "You plan data retrieval for an ERP assistant for a mattress manufacturer. " +
          "Choose 1-3 retrievers that will answer the user's question. Never invent data. " +
          `Retrievers:\n${TOOL_CATALOGUE}\n` +
          `For erp_query, args must be {"spec": {"entity": ..., "filters": [{"column","op","value"}], "orderBy", "ascending", "limit"}}. ` +
          `Available entities and filterable columns:\n${describeEntities()}\n` +
          `Operators: eq, neq, gt, gte, lt, lte, ilike, in, is_null, not_null. Dates are ISO yyyy-mm-dd.\n` +
          'Reply as JSON: {"steps":[{"tool":"...","args":{...}}]}',
      },
      ...history,
      {
        role: "user",
        content: `Today is ${todayIndia()}. Question: ${question}`,
      },
    ],
    { model: AI_MODELS.fast, maxTokens: 500, temperature: 0 },
  );

  if (!Array.isArray(plan?.steps) || !plan.steps.length || plan.steps.length > 3) {
    throw new AiRetrievalError("The AI could not select reliable data for this question. Please try again.");
  }
  return plan.steps;
}

function extractMoney(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "");
  const matches = cleaned.match(/(?:₹|rs\.?|inr\s*)\s*(\d+(?:\.\d+)?)/gi) ?? [];
  for (const match of matches) {
    const n = Number(match.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractBudgetFromQuestion(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
): number | null {
  const current = extractMoney(question);
  if (current != null) return current;
  const budgetWords = /budget|under|within|below|upto|up to|less than|cheaper|cost/i.test(question);
  if (!budgetWords) return null;
  for (const message of [...history].reverse().filter((m) => m.role === "user")) {
    const value = extractMoney(message.content);
    if (value != null) return value;
  }
  return null;
}

function num(args: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const raw = args?.[key];
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1095) : fallback;
}

function periodFor(args: Record<string, unknown> | undefined, fallbackDays: number): Period {
  if (typeof args?.["from"] === "string" && typeof args?.["to"] === "string") {
    return { from: args["from"] as string, to: args["to"] as string };
  }
  return defaultPeriod(num(args, "days", fallbackDays));
}

export async function runRetriever(
  db: Db,
  step: PlanStep,
): Promise<{ tool: string; data: unknown }> {
  const a = step.args;
  switch (step.tool) {
    case "sales_summary":
      return { tool: step.tool, data: await salesSummary(db, periodFor(a, 30)) };
    case "product_profitability":
      return { tool: step.tool, data: await productProfitability(db, periodFor(a, 90)) };
    case "customer_profitability":
      return { tool: step.tool, data: await customerProfitability(db, periodFor(a, 90)) };
    case "receivables":
      return { tool: step.tool, data: await receivables(db) };
    case "inventory":
      return { tool: step.tool, data: await inventoryIntelligence(db, num(a, "days", 90)) };
    case "production":
      return { tool: step.tool, data: await productionIntelligence(db, num(a, "days", 90)) };
    case "supplier_pricing":
      return { tool: step.tool, data: await supplierPricing(db, num(a, "days", 365)) };
    case "monthly_series":
      return { tool: step.tool, data: await monthlySeries(db, num(a, "months", 12)) };
    case "forecasts":
      return { tool: step.tool, data: await forecasts(db, 3) };
    case "anomalies":
      return { tool: step.tool, data: await detectAnomalies(db) };
    case "erp_query":
      return { tool: step.tool, data: await runControlledQuery(db, a?.["spec"] ?? a) };
    case "document_search":
      return { tool: step.tool, data: await semanticSearch(db, String(a?.["query"] ?? ""), 6) };
    case "mattress_budget_recommendations": {
      const budget = typeof a?.["budget"] === "number" ? a["budget"] : Number(a?.["budget"] ?? 0);
      if (!Number.isFinite(budget) || budget <= 0) {
        throw new AiRetrievalError("A valid mattress customer budget is required.");
      }
      return {
        tool: step.tool,
        data: await mattressBudgetRecommendations(db, {
          budget,
          limit: typeof a?.["limit"] === "number" ? a["limit"] : Number(a?.["limit"] ?? 5),
          stockOnly: a?.["stockOnly"] === true,
          preferInStock: a?.["preferInStock"] !== false,
          preference: a?.["preference"] === "cheaper" || a?.["preference"] === "premium" ? a["preference"] : "balanced",
        }),
      };
    }
    case "business_snapshot":
      return { tool: "business_snapshot", data: await businessSnapshot(db) };
    default:
      throw new AiRetrievalError("The AI selected an unsupported data source. No answer was generated.");
  }
}

export interface AskResult {
  answer: string;
  usedRetrievers: string[];
  evidence: Record<string, unknown>;
  evidenceMeta: { complete: boolean; truncatedSources: string[]; answerState: "exact" | "calculated" | "forecast" | "interpretation" | "insufficient-data" };
  model: string;
}

export async function askMaestro(
  db: Db,
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<AskResult> {
  const inferredBudget = extractBudgetFromQuestion(question, history);
  const isMattressBudgetRequest =
    inferredBudget != null &&
    /mattress|specification|specs|bom|boq|customer budget|under|within|upto|up to|cheaper/i.test(question);

  let steps: PlanStep[];
  if (isMattressBudgetRequest) {
    steps = [
      {
        tool: "mattress_budget_recommendations",
        args: {
          budget: inferredBudget,
          limit: 5,
          stockOnly: /in[ -]?stock only|only.*stock|available.*stock/i.test(question),
          preferInStock: true,
          preference: /cheaper|lower.?priced|budget.?friendly/i.test(question)
            ? "cheaper"
            : /premium|higher.?end|best.?quality/i.test(question)
              ? "premium"
              : "balanced",
        },
      },
    ];
  } else {
    steps = await planTools(question, history);
  }
  const results: { tool: string; data: unknown }[] = [];
  for (const step of steps) {
    try {
      results.push(await runRetriever(db, step));
    } catch {
      throw new AiRetrievalError("The requested ERP data could not be retrieved. No answer was generated.");
    }
  }

  const evidence = Object.fromEntries(results.map((r) => [r.tool, r.data]));
  const truncatedSources: string[] = [];
  const serialisedParts = results.map((r) => {
    const raw = JSON.stringify(r.data);
    if (raw.length <= 18_000) return `[${r.tool}] ${raw}`;
    truncatedSources.push(r.tool);
    return `[${r.tool}] ${raw.slice(0, 17_500)}\n[TRUNCATED: source payload exceeds the safe model context budget; do not present omitted records as complete]`;
  });
  const evidenceComplete = truncatedSources.length === 0;
  const evidenceStatus = evidenceComplete ? "complete" : "partial";
  const serialised = `EVIDENCE_STATUS=${evidenceStatus}\n${serialisedParts.join("\n\n")}`;

  const { text, model } = await aiChat(
    [
      {
        role: "system",
        content:
          "You are Mattress Maestro's business analyst for an Indian mattress manufacturer. " +
          "Answer ONLY from the ERP DATA provided. Never invent or estimate a figure that is not present; " +
          "if the data does not contain the answer, say exactly what is missing. " +
          "Amounts are Indian rupees — format them with the ₹ symbol and Indian digit grouping. " +
          "Be concise and specific: lead with the direct answer, then the supporting numbers, then at most three recommendations. " +
          "Label anything predictive as a forecast and anything interpretive as your reading of the data. " +
          "If EVIDENCE_STATUS is partial, explicitly say the answer is based on incomplete evidence and do not call it authoritative. " +
          "For mattress_budget_recommendations, show every defensible candidate supplied by the ERP (normally at least five), with product/model name, configured selling price, product specs, BOM components with quantities, estimated material cost, cost basis, and stock readiness. If fewer than five are supplied, explicitly say that the ERP data does not support five and do not manufacture alternatives. " +
          "Use short markdown: bold labels, bullet lists, small tables. Never claim to have changed anything in the ERP.",
      },
      ...history.map((m) => ({ role: m.role, content: m.content }) as const),
      {
        role: "user",
        content: `Question: ${question}\n\nERP DATA (authoritative):\n${serialised}`,
      },
    ],
    { maxTokens: 1400, temperature: 0.15 },
  );

  const answerState =
    truncatedSources.length > 0
      ? "insufficient-data"
      : results.some((r) => r.tool === "forecasts") ? "forecast"
      : results.some((r) => r.tool === "erp_query" || r.tool === "sales_summary" || r.tool === "receivables") ? "exact"
      : "calculated";
  return {
    answer: text,
    usedRetrievers: results.map((r) => r.tool),
    evidence,
    evidenceMeta: { complete: evidenceComplete, truncatedSources, answerState },
    model,
  };
}

/** Focused analysis used by the contextual AI buttons inside ERP screens. */
export async function contextualAnalysis(
  db: Db,
  topic: "sales" | "profitability" | "inventory" | "production" | "receivables" | "suppliers",
  focus?: string,
): Promise<AskResult> {
  const map: Record<typeof topic, PlanStep[]> = {
    sales: [
      { tool: "sales_summary", args: { days: 90 } },
      { tool: "monthly_series", args: { months: 12 } },
    ],
    profitability: [
      { tool: "product_profitability", args: { days: 90 } },
      { tool: "monthly_series", args: { months: 12 } },
    ],
    inventory: [{ tool: "inventory", args: { days: 90 } }, { tool: "forecasts" }],
    production: [{ tool: "production", args: { days: 90 } }],
    receivables: [{ tool: "receivables" }],
    suppliers: [{ tool: "supplier_pricing", args: { days: 365 } }],
  };

  const results = await Promise.all(map[topic].map((s) => runRetriever(db, s))).catch(() => {
    throw new AiRetrievalError("The requested ERP data could not be retrieved. No answer was generated.");
  });
  const evidence = Object.fromEntries(results.map((r) => [r.tool, r.data]));

  const { text, model } = await aiChat(
    [
      {
        role: "system",
        content:
          "You are Mattress Maestro's business analyst. Explain the supplied ERP data for the requested area. " +
          "Use only the given figures, format money in ₹, and structure the answer as: What the data shows / Why it may be happening / What to check next. " +
          "Keep it under 250 words. Never state that you changed ERP data.",
      },
      {
        role: "user",
        content: `Area: ${topic}${focus ? `\nFocus: ${focus}` : ""}\n\nERP DATA:\n${JSON.stringify(evidence).slice(0, 40_000)}`,
      },
    ],
    { maxTokens: 900, temperature: 0.2 },
  );

  return {
    answer: text,
    usedRetrievers: results.map((r) => r.tool),
    evidence,
    evidenceMeta: { complete: true, truncatedSources: [], answerState: topic === "profitability" ? "calculated" : "interpretation" },
    model,
  };
}
