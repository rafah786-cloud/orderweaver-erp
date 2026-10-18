# Mattress Maestro AI architecture

## Central gateway

All server-side AI calls continue to enter through `src/lib/ai/nvidia.server.ts`. The filename is retained for compatibility, but the gateway is now provider-configurable.

Configuration precedence:

- `AI_PROVIDER` — provider label for observability; defaults to `nvidia`.
- `AI_BASE_URL` — OpenAI-compatible API base URL.
- `AI_API_KEY` — preferred server-only API credential.
- `AI_CHAT_MODEL`, `AI_FAST_MODEL`, `AI_VISION_MODEL`, `AI_EMBED_MODEL` — capability-specific model overrides.
- Existing `NVIDIA_*` variables remain supported for backward compatibility.

The ERP keeps the existing NVIDIA defaults unchanged. Embeddings remain constrained to the existing 2048-dimension document-vector schema.

## Retrieval-first safety

Ask Mattress Maestro does not receive database credentials and does not generate SQL. It selects from a fixed retrieval catalogue, and deterministic server functions execute those reads through the caller's RLS-scoped Supabase client.

AI responses are explanatory/propositional. ERP transaction posting, accounting, stock movement and document lifecycle functions remain deterministic ERP code.

## Budget-aware mattress recommendations

The `mattress_budget_recommendations` capability is read-only and uses only ERP records:

1. Existing `product_models` under the requested configured selling price.
2. Existing `model_boq` component quantities.
3. Current `raw_materials.current_stock`.
4. Recorded purchase rates over the last 365 days.
5. Existing `stock_items.standard_price` only as a fallback when purchase history is unavailable.
6. Active-company scoping through `current_company_id()`.

A candidate is not counted as defensible if a BOM component, material or cost basis is missing. The assistant never fabricates a fifth option simply to satisfy the requested count.

The capability supports balanced, cheaper and premium ranking, plus in-stock-only follow-ups. It never creates or changes a BOM, purchase order, sales order, stock record or accounting transaction.

## Operational requirement

For five genuinely BOM-grounded recommendations to be possible in a company, that company needs:

- at least five relevant product models,
- populated BOM/BOQ lines,
- usable material quantities,
- current stock data, and
- purchase or configured standard costs for the BOM components.

If those ERP inputs are incomplete, the AI must say so rather than invent specifications or costs.

## Capability-based specialist agents

The agent registry in src/lib/ai/agent-router.server.ts separates business reasoning, fast classification, document vision, semantic retrieval, marketing copy, marketing image generation, forecasting and mattress specification. Model names remain environment-configurable; no provider credentials are sent to the browser.

- The ERP analyst uses the configured reasoning model and the planner uses the fast classification model. Both operate over deterministic, RLS-scoped retrievals; they do not execute arbitrary SQL or post transactions.
- Document image extraction uses the dedicated vision model; extracted fields remain proposals until a person confirms them.
- Marketing copy uses the server-side AI gateway. Marketing image generation uses a separate image endpoint/model so the visual task can be optimized independently.
- Marketing creatives are drafts, stored with company ownership and private image assets. Publishing to social platforms and direct customer delivery are separate workflows and are never triggered by generation.
- Forecasts are calculated from ERP evidence and require human review before operational commitments; mattress specification recommendations remain constrained to existing BOM/material/cost data.

### Marketing image provider configuration

Set server-side IMAGE_API_KEY (or OPENAI_API_KEY) to enable the default OpenAI-compatible image provider. Optionally configure IMAGE_PROVIDER, IMAGE_API_BASE_URL and IMAGE_MODEL for another compatible image service. The default model is gpt-image-1. These variables must be set in the hosting environment's server secrets; do not add keys to source files, Vite client variables or the database. Copy generation remains available when image generation is not configured.

The AI status endpoint exposes only agent labels, model names, provider labels, configured/not-configured status, write-access class and human-review requirement. It never returns credentials. Generated images are stored in a private marketing-creatives bucket under the active company UUID, with short-lived signed preview URLs.
