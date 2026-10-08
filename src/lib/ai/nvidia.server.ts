import process from "node:process";

/**
 * Centralised AI gateway (server-only).
 *
 * Every AI call in the ERP goes through this module: one place for the API
 * key, model selection, timeouts, retries and error shaping. The key is read
 * from the server environment at call time and never leaves the server.
 *
 * The gateway uses the OpenAI-compatible chat/embedding wire format. NVIDIA is
 * the default provider, while AI_BASE_URL / AI_API_KEY / AI_*_MODEL allow an
 * administrator to point the same gateway at another compatible provider.
 * Embeddings remain constrained to the existing 2048-dimension ERP vector schema.
 */

export const AI_PROVIDER = process.env["AI_PROVIDER"] || "nvidia";

/** OpenAI-compatible AI gateway. NVIDIA remains the default so existing deployments are unchanged. */
const BASE_URL = (process.env["AI_BASE_URL"] || process.env["NVIDIA_BASE_URL"] || "https://integrate.api.nvidia.com/v1").replace(
  /\/+$/,
  "",
);

/** Secrets pasted with surrounding quotes/whitespace are a common mistake — normalise defensively. */
function cleanSecret(v: string | undefined): string {
  return (v ?? "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

export const AI_MODELS = {
  /** General reasoning / business analysis. */
  chat: process.env["AI_CHAT_MODEL"] || process.env["NVIDIA_CHAT_MODEL"] || "nvidia/nemotron-3-super-120b-a12b",
  /** Cheaper/faster model for short classification + extraction jobs. */
  fast: process.env["AI_FAST_MODEL"] || process.env["NVIDIA_FAST_MODEL"] || "nvidia/nemotron-3.5-lightning-30b-a3b",
  /** Vision model for scanned invoices / photographed documents. */
  vision: process.env["AI_VISION_MODEL"] || process.env["NVIDIA_VISION_MODEL"] || "meta/llama-3.2-11b-vision-instruct",
  /** Retrieval embeddings (2048 dimensions — matches ai_document_chunks). */
  embedding: process.env["AI_EMBED_MODEL"] || process.env["NVIDIA_EMBED_MODEL"] || "nvidia/nemotron-3-embed-1b",
} as const;

export const EMBEDDING_DIMENSIONS = 2048;

export class AiUnavailableError extends Error {
  code = "AI_UNAVAILABLE" as const;
}

export function isAiConfigured(): boolean {
  return Boolean(cleanSecret(process.env["AI_API_KEY"] || process.env["NVIDIA_API_KEY"]));
}

function apiKey(): string {
  const key = cleanSecret(process.env["AI_API_KEY"] || process.env["NVIDIA_API_KEY"]);
  if (!key) {
    throw new AiUnavailableError(
      "AI is not configured yet. Add the AI_API_KEY secret (or keep NVIDIA_API_KEY for the default NVIDIA gateway) to enable AI features. The rest of the ERP is unaffected.",
    );
  }
  return key;
}

export type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "user";
      content: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      >;
    };

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask the model for a JSON object response. */
  json?: boolean;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

async function post(path: string, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (e instanceof AiUnavailableError) throw e;
      const retriable =
        e instanceof Error &&
        /\b(429|5\d\d|timeout|aborted|network|fetch failed)\b/i.test(e.message);
      if (!retriable || attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI request failed");
}

export interface ChatResult {
  text: string;
  model: string;
  usage: { prompt: number; completion: number } | null;
}

/** Single-shot chat completion. */
export async function aiChat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const model = options.model ?? AI_MODELS.chat;
  return withRetry(async () => {
    const res = await post(
      "/chat/completions",
      {
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1200,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      },
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`AI request failed (${res.status}): ${detail.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices?.[0]?.message?.content?.trim() ?? "",
      model,
      usage: json.usage
        ? { prompt: json.usage.prompt_tokens ?? 0, completion: json.usage.completion_tokens ?? 0 }
        : null,
    };
  });
}

/** Chat completion whose answer is parsed as JSON. Tolerates fenced output. */
export async function aiChatJson<T>(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<T> {
  const { text } = await aiChat(messages, { ...options, json: true });
  return parseJsonLoose<T>(text);
}

export function parseJsonLoose<T>(raw: string): T {
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error("The AI returned a response that could not be read as structured data.");
  }
}

/** Embeddings for semantic document search. */
export async function aiEmbed(
  input: string[],
  kind: "query" | "passage" = "passage",
): Promise<number[][]> {
  if (input.length === 0) return [];
  return withRetry(async () => {
    const res = await post(
      "/embeddings",
      {
        model: AI_MODELS.embedding,
        input,
        input_type: kind,
        encoding_format: "float",
        truncate: "END",
      },
      30_000,
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`AI embedding failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as { data?: { embedding: number[]; index: number }[] };
    const rows = (json.data ?? []).slice().sort((a, b) => a.index - b.index);
    return rows.map((r) => r.embedding);
  });
}
