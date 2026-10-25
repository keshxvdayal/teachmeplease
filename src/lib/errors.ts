// Error codes are stable strings the client maps to friendly copy.
export type AppErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "busy"
  | "limit_reached"
  | "turn_limit_reached"
  | "message_too_long"
  | "too_short"
  | "ai_rate_limited"
  | "ai_timeout"
  | "ai_unavailable"
  | "ai_invalid_response"
  | "server_error";

const statusByCode: Record<AppErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  busy: 409,
  limit_reached: 429,
  turn_limit_reached: 409,
  message_too_long: 400,
  too_short: 422,
  ai_rate_limited: 503,
  ai_timeout: 504,
  ai_unavailable: 503,
  ai_invalid_response: 502,
  server_error: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(code: AppErrorCode, message: string, opts: { retryAfterSeconds?: number } = {}) {
    super(message);
    this.code = code;
    this.status = statusByCode[code];
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}
