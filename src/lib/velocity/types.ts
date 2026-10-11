export type VelocityErrorCode =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "UNAUTHORIZED"
  | "ACCESS_DENIED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE"
  | "CACHE_ERROR"
  | "UNDOCUMENTED_ENDPOINT";

export type VelocityFailure = {
  code: VelocityErrorCode;
  message: string;
  status: number | null;
  retryable: boolean;
};

export type VelocityDiagnostic = {
  ok: boolean;
  correlationId: string;
  checkedAt: string;
  durationMs: number;
  retried: boolean;
  error: VelocityFailure | null;
};