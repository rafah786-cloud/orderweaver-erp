import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ai/nvidia.server", () => ({
  aiChat: vi.fn(), aiChatJson: vi.fn(), AI_MODELS: { fast: "existing-model" },
}));
vi.mock("./ai/erp-data.server", () => ({
  businessSnapshot: vi.fn(), salesSummary: vi.fn(), receivables: vi.fn(),
  defaultPeriod: vi.fn(() => ({ from: "2026-01-01", to: "2026-01-31" })),
}));
vi.mock("./ai/query-layer.server", () => ({ describeEntities: () => "invoices", runControlledQuery: vi.fn() }));
vi.mock("./ai/documents.server", () => ({ semanticSearch: vi.fn() }));

import { askMaestro, contextualAnalysis, runRetriever } from "./ai/assistant.server";
import { aiChat, aiChatJson } from "./ai/nvidia.server";
import { businessSnapshot, salesSummary, receivables, type Db } from "./ai/erp-data.server";

const db = {} as Db;
beforeEach(() => vi.resetAllMocks());

describe("AI retrieval safeguards", () => {
  it("supplies complete follow-up history to planning and answering", async () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ role: "user" as const, content: `earlier ${i}` }));
    vi.mocked(aiChatJson).mockResolvedValue({ steps: [{ tool: "receivables" }] });
    vi.mocked(receivables).mockResolvedValue({} as never);
    vi.mocked(aiChat).mockResolvedValue({ text: "answer", model: "existing-model", usage: null });
    await askMaestro(db, "And which are overdue?", history);
    expect(vi.mocked(aiChatJson).mock.calls[0]?.[0]).toEqual(expect.arrayContaining(history));
    expect(vi.mocked(aiChat).mock.calls[0]?.[0]).toEqual(expect.arrayContaining(history));
  });
  it("does not substitute snapshots after planner failure", async () => {
    vi.mocked(aiChatJson).mockRejectedValue(new Error("planner unavailable"));
    await expect(askMaestro(db, "sales?")).rejects.toThrow("planner unavailable");
    expect(businessSnapshot).not.toHaveBeenCalled();
    expect(aiChat).not.toHaveBeenCalled();
  });
  it.each([{}, { steps: [] }, { steps: "invalid" }])("rejects invalid plans %j", async (plan) => {
    vi.mocked(aiChatJson).mockResolvedValue(plan);
    await expect(askMaestro(db, "sales?")).rejects.toThrow("reliable data");
    expect(businessSnapshot).not.toHaveBeenCalled();
  });
  it("fails safely on unknown retriever names", async () => {
    await expect(runRetriever(db, { tool: "invented" })).rejects.toThrow("unsupported data source");
    expect(businessSnapshot).not.toHaveBeenCalled();
  });
  it("does not send failed retrieval diagnostics to the answer model", async () => {
    vi.mocked(aiChatJson).mockResolvedValue({ steps: [{ tool: "receivables" }] });
    vi.mocked(receivables).mockRejectedValue(new Error("private database diagnostics"));
    await expect(askMaestro(db, "dues?")).rejects.toThrow("No answer was generated");
    expect(aiChat).not.toHaveBeenCalled();
  });
  it("also aborts contextual generation when retrieval fails", async () => {
    vi.mocked(receivables).mockRejectedValue(new Error("private diagnostics"));
    await expect(contextualAnalysis(db, "receivables")).rejects.toThrow("No answer was generated");
    expect(aiChat).not.toHaveBeenCalled();
  });
});