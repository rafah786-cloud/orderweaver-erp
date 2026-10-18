/**
 * Capability-based agent routing for Mattress Maestro.
 * The router selects a specialist for the task; every agent is still constrained
 * by authenticated server functions, RLS-scoped data, and human approval gates.
 */
export type AiCapability =
  | "business_reasoning"
  | "fast_classification"
  | "document_vision"
  | "semantic_retrieval"
  | "marketing_copy"
  | "marketing_image"
  | "forecasting"
  | "mattress_specification";

export interface AiAgentDefinition {
  id: string;
  label: string;
  capability: AiCapability;
  providerEnv: string;
  modelEnv: string;
  defaultProvider: string;
  defaultModelEnvFallback?: string;
  writeAccess: "none" | "draft_only";
  humanApprovalRequired: boolean;
}

export const AI_AGENT_REGISTRY: readonly AiAgentDefinition[] = [
  { id: "maestro-reasoner", label: "Business reasoning agent", capability: "business_reasoning", providerEnv: "AI_PROVIDER", modelEnv: "AI_CHAT_MODEL", defaultProvider: "nvidia", writeAccess: "none", humanApprovalRequired: false },
  { id: "rapid-classifier", label: "Fast classification agent", capability: "fast_classification", providerEnv: "AI_PROVIDER", modelEnv: "AI_FAST_MODEL", defaultProvider: "nvidia", writeAccess: "none", humanApprovalRequired: false },
  { id: "document-vision", label: "Document vision agent", capability: "document_vision", providerEnv: "AI_PROVIDER", modelEnv: "AI_VISION_MODEL", defaultProvider: "nvidia", writeAccess: "none", humanApprovalRequired: true },
  { id: "semantic-retriever", label: "Knowledge retrieval agent", capability: "semantic_retrieval", providerEnv: "AI_PROVIDER", modelEnv: "AI_EMBED_MODEL", defaultProvider: "nvidia", writeAccess: "none", humanApprovalRequired: false },
  { id: "campaign-copywriter", label: "Marketing creative agent", capability: "marketing_copy", providerEnv: "AI_PROVIDER", modelEnv: "AI_CHAT_MODEL", defaultProvider: "nvidia", writeAccess: "draft_only", humanApprovalRequired: true },
  { id: "campaign-art-director", label: "Marketing image agent", capability: "marketing_image", providerEnv: "IMAGE_PROVIDER", modelEnv: "IMAGE_MODEL", defaultProvider: "openai", writeAccess: "draft_only", humanApprovalRequired: true },
  { id: "forecast-analyst", label: "Forecasting agent", capability: "forecasting", providerEnv: "AI_PROVIDER", modelEnv: "AI_FAST_MODEL", defaultProvider: "nvidia", writeAccess: "none", humanApprovalRequired: true },
  { id: "mattress-specifier", label: "Mattress specification agent", capability: "mattress_specification", providerEnv: "AI_PROVIDER", modelEnv: "AI_CHAT_MODEL", defaultProvider: "nvidia", writeAccess: "none", humanApprovalRequired: true },
] as const;

export function agentForCapability(capability: AiCapability): AiAgentDefinition {
  const agent = AI_AGENT_REGISTRY.find((item) => item.capability === capability);
  if (!agent) throw new Error("No AI agent is registered for this capability.");
  return agent;
}

export function marketingImageConfig(env: Record<string, string | undefined>) {
  const apiKey = (env["IMAGE_API_KEY"] || env["OPENAI_API_KEY"] || "").trim();
  return {
    configured: Boolean(apiKey),
    provider: env["IMAGE_PROVIDER"] || "openai",
    model: env["IMAGE_MODEL"] || "gpt-image-1",
    baseUrl: (env["IMAGE_API_BASE_URL"] || "https://api.openai.com/v1").replace(/\/+$/, ""),
  };
}
