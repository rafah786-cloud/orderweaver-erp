import { describe, expect, it } from "vitest";
import { AI_AGENT_REGISTRY, agentForCapability, marketingImageConfig } from "./agent-router.server";

describe("capability-based AI agent routing", () => {
  it("assigns distinct specialist agents to marketing copy and image generation", () => {
    const copy = agentForCapability("marketing_copy");
    const image = agentForCapability("marketing_image");
    expect(copy.id).toBe("campaign-copywriter");
    expect(image.id).toBe("campaign-art-director");
    expect(copy.id).not.toBe(image.id);
    expect(copy.humanApprovalRequired).toBe(true);
    expect(image.humanApprovalRequired).toBe(true);
  });

  it("keeps all defined capabilities mapped to a registered agent", () => {
    const capabilities = new Set(AI_AGENT_REGISTRY.map(agent => agent.capability));
    expect(capabilities).toEqual(new Set([
      "business_reasoning", "fast_classification", "document_vision", "semantic_retrieval",
      "marketing_copy", "marketing_image", "forecasting", "mattress_specification",
    ]));
  });

  it("does not claim image generation is configured without a server-side key", () => {
    expect(marketingImageConfig({}).configured).toBe(false);
    expect(marketingImageConfig({ OPENAI_API_KEY: "server-secret" })).toMatchObject({
      configured: true, provider: "openai", model: "gpt-image-1", baseUrl: "https://api.openai.com/v1",
    });
  });

  it("allows a private compatible image provider to be configured without client secrets", () => {
    expect(marketingImageConfig({
      IMAGE_API_KEY: "key", IMAGE_PROVIDER: "private-provider",
      IMAGE_API_BASE_URL: "https://image.example/v1/", IMAGE_MODEL: "image-model",
    })).toMatchObject({
      configured: true, provider: "private-provider", model: "image-model",
      baseUrl: "https://image.example/v1",
    });
  });
});
