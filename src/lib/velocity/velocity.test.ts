import { afterEach, describe, expect, it, vi } from "vitest";
import { safeVelocityFailure, velocityHttp, velocityBaseUrl } from "./http.server";
import { velocityRequest } from "./client.server";
import { ratesInput, serviceabilityInput, serviceabilityResponse } from "./schemas";

vi.mock("./auth.server", () => ({ getVelocityToken: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Velocity transport boundaries", () => {
  it("rejects alternate hosts and credential-bearing URLs", () => {
    for (const url of ["http://shazam.velocity.in", "https://example.com", "https://user:pass@shazam.velocity.in", "https://shazam.velocity.in/?x=1"]) {
      vi.stubEnv("VELOCITY_BASE_URL", url);
      expect(velocityBaseUrl).toThrow("not configured");
    }
  });
  it("never follows redirects or returns provider error bodies", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("sensitive-provider-body", { status: 403 }));
    expect(await velocityHttp("/custom/api/v1/serviceability", { method: "POST" }, { fetcher })).toEqual({ status: 403, body: null });
    expect(fetcher.mock.calls[0]?.[1].redirect).toBe("error");
  });
  it("redacts arbitrary network errors", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("sensitive-request-details"));
    try { await velocityHttp("/custom/api/v1/rates", {}, { fetcher }); }
    catch (error) { expect(JSON.stringify(safeVelocityFailure(error))).not.toContain("sensitive-request-details"); }
    expect(safeVelocityFailure(new Error("private"))).toEqual({ code: "PROVIDER_ERROR", message: "Velocity could not complete the request.", status: null, retryable: false });
  });
  it("times out stalled responses", async () => {
    const fetcher: typeof fetch = vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    await expect(velocityHttp("/custom/api/v1/rates", {}, { fetcher, timeoutMs: 5 })).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("rejects invalid JSON and oversized responses", async () => {
    for (const body of ["not-json", "x".repeat(1_048_577)]) {
      await expect(velocityHttp("/custom/api/v1/rates", {}, { fetcher: vi.fn().mockResolvedValue(new Response(body)) })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });
});

describe("bounded authentication recovery", () => {
  it("refreshes only once after 401 and sends replacement bearer server-side", async () => {
    vi.stubEnv("VELOCITY_API_KEY", "");
    const getToken = vi.fn().mockResolvedValueOnce("test-old").mockResolvedValueOnce("test-new");
    const request = vi.fn().mockResolvedValueOnce({ status: 401, body: null }).mockResolvedValueOnce({ status: 200, body: {} });
    expect(await velocityRequest("/custom/api/v1/serviceability", {}, { getToken, request })).toEqual({ body: {}, retried: true });
    expect(getToken).toHaveBeenLastCalledWith({ forceRefresh: true, rejectedToken: "test-old" });
    expect(request.mock.calls[1]?.[1].headers.Authorization).toBe("Bearer test-new");
  });
  it("stops after a second 401", async () => {
    vi.stubEnv("VELOCITY_API_KEY", "");
    const getToken = vi.fn().mockResolvedValue("test-token");
    const request = vi.fn().mockResolvedValue({ status: 401, body: null });
    await expect(velocityRequest("/custom/api/v1/rates", {}, { getToken, request })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not refresh managed API keys or retry non-401 failures", async () => {
    vi.stubEnv("VELOCITY_API_KEY", "test-key");
    const getToken = vi.fn();
    const request = vi.fn().mockResolvedValue({ status: 401, body: null });
    await expect(velocityRequest("/custom/api/v1/rates", {}, { getToken, request })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(getToken).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(1);
    vi.stubEnv("VELOCITY_API_KEY", ""); getToken.mockResolvedValue("test"); request.mockResolvedValue({ status: 403, body: null });
    await expect(velocityRequest("/custom/api/v1/rates", {}, { getToken, request })).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(getToken).toHaveBeenCalledTimes(1);
  });
});

describe("official shipping contracts", () => {
  const dimensions = { origin_pincode: "560068", destination_pincode: "400001", dead_weight: 500, length: 20, width: 10, height: 10 };
  it("requires COD value and rejects guessed fields and nonpositive dimensions", () => {
    expect(ratesInput.safeParse({ ...dimensions, journey_type: "forward", payment_method: "cod" }).success).toBe(false);
    expect(ratesInput.safeParse({ ...dimensions, journey_type: "forward", payment_method: "cod", shipment_value: 100 }).success).toBe(true);
    expect(ratesInput.safeParse({ ...dimensions, journey_type: "return", breadth: 10 }).success).toBe(false);
    expect(ratesInput.safeParse({ ...dimensions, journey_type: "return", dead_weight: 0 }).success).toBe(false);
  });
  it("accepts documented serviceability envelope and strips unexpected response fields", () => {
    expect(serviceabilityInput.safeParse({ from: "560068", to: "400001", payment_mode: "prepaid", shipment_type: "forward" }).success).toBe(true);
    const parsed = serviceabilityResponse.parse({ status: "SUCCESS", private: "discard", result: { zone: "zone_a", serviceability_results: [{ carrier_id: "test", carrier_name: "Test fixture", private: "discard" }] } });
    expect(JSON.stringify(parsed)).not.toContain("discard");
    expect(serviceabilityResponse.safeParse({ status: "SUCCESS" }).success).toBe(false);
  });
});