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
  model: string;
}

export async function askMaestro(
  db: Db,
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<AskResult> {
  const steps = await planTools(question, history);
  const results: { tool: string; data: unknown }[] = [];
  for (const step of steps) {
    try {
      results.push(await runRetriever(db, step));
    } catch {
      throw new AiRetrievalError("The requested ERP data could not be retrieved. No answer was generated.");
    }
  }

  const evidence = Object.fromEntries(results.map((r) => [r.tool, r.data]));
  const serialised = JSON.stringify(evidence).slice(0, 60_000);

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

  return { answer: text, usedRetrievers: results.map((r) => r.tool), evidence, model };
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

  return { answer: text, usedRetrievers: results.map((r) => r.tool), evidence, model };
}
