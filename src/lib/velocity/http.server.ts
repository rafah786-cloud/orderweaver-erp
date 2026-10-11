import type { VelocityErrorCode, VelocityFailure } from "./types";

export const VELOCITY_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 1_048_576;

const messages: Record<VelocityErrorCode, string> = {
  NOT_CONFIGURED: "Velocity credentials or connection settings are not configured.",
  TIMEOUT: "Velocity did not respond within the time limit.",
  NETWORK_ERROR: "Velocity could not be reached.",
  UNAUTHORIZED: "Velocity rejected authentication after recovery.",
  ACCESS_DENIED: "Velocity denied API access for this account.",
  RATE_LIMITED: "Velocity is limiting requests. Try again later.",
  PROVIDER_ERROR: "Velocity could not complete the request.",
  INVALID_RESPONSE: "Velocity returned an invalid or unsupported response.",
  CACHE_ERROR: "Velocity authentication could not be safely stored or retrieved.",
  UNDOCUMENTED_ENDPOINT: "This Velocity endpoint is unavailable until its official schema is verified.",
};

export class VelocityApiError extends Error {
  readonly code: VelocityErrorCode;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(code: VelocityErrorCode, status: number | null = null) {
    super(messages[code]);
    this.name = "VelocityApiError";
    this.code = code;
    this.status = status;
    this.retryable = ["TIMEOUT", "NETWORK_ERROR", "RATE_LIMITED"].includes(code) ||
      (code === "PROVIDER_ERROR" && status !== null && status >= 500);
  }
}

export function safeVelocityFailure(error: unknown): VelocityFailure {
  const safe = error instanceof VelocityApiError ? error : new VelocityApiError("PROVIDER_ERROR");
  return { code: safe.code, message: safe.message, status: safe.status, retryable: safe.retryable };
}

export function velocityHttpError(status: number): VelocityApiError {
  return new VelocityApiError(
    status === 401 ? "UNAUTHORIZED" : status === 403 ? "ACCESS_DENIED" :
      status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR",
    status,
  );
}

/** Exact provider origin only; never follow redirects with credentials. */
export function velocityBaseUrl(): string {
  const configured = process.env["VELOCITY_BASE_URL"] || "https://shazam.velocity.in";
  try {
    const url = new URL(configured);
    if (url.origin !== "https://shazam.velocity.in" || url.username || url.password ||
      url.search || url.hash || !/^\/*$/.test(url.pathname)) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new VelocityApiError("NOT_CONFIGURED");
  }
}

/** Timeout covers both headers and bounded response consumption. No body/header logging. */
export async function velocityHttp(
  path: string,
  init: RequestInit,
  options: { timeoutMs?: number; fetcher?: typeof fetch } = {},
): Promise<{ status: number; body: unknown }> {
  if (!/^\/custom\/api\/v1\/[a-z-]+$/.test(path)) throw new VelocityApiError("UNDOCUMENTED_ENDPOINT");
  const base = velocityBaseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? VELOCITY_TIMEOUT_MS);
  try {
    const response = await (options.fetcher ?? fetch)(`${base}${path}`, {
      ...init, signal: controller.signal, redirect: "error",
    });
    // Provider error bodies may echo credentials; discard them without parsing.
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status, body: null };
    }
    const reader = response.body?.getReader();
    if (!reader) throw new VelocityApiError("INVALID_RESPONSE", response.status);
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new VelocityApiError("INVALID_RESPONSE", response.status);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try {
      return { status: response.status, body: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
    } catch {
      throw new VelocityApiError("INVALID_RESPONSE", response.status);
    }
  } catch (error) {
    if (controller.signal.aborted) throw new VelocityApiError("TIMEOUT");
    if (error instanceof VelocityApiError) throw error;
    throw new VelocityApiError("NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
  }
}