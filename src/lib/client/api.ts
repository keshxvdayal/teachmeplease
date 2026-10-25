// Browser-side fetch helper. Normalises server and network errors into one shape.

export interface ApiError {
  code: string;
  message: string;
  retryAfterSeconds?: number;
  status: number;
}

export class ApiRequestError extends Error {
  constructor(readonly error: ApiError) {
    super(error.message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ data: T; status: number }> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: { ...(json !== undefined && { "Content-Type": "application/json" }), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiRequestError({
      code: "network",
      message: "You appear to be offline or the connection dropped. Your conversation is saved — try again.",
      status: 0,
    });
  }
  if (res.status === 204) return { data: undefined as T, status: 204 };
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError({
      code: body?.error?.code ?? "server_error",
      message: body?.error?.message ?? "Something went wrong. Please try again.",
      retryAfterSeconds: body?.error?.retryAfterSeconds,
      status: res.status,
    });
  }
  return { data: body as T, status: res.status };
}

export function trackEvent(name: "landing_view" | "scorecard_view" | "voice_failure", props?: Record<string, string | number | boolean>) {
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, props }),
    keepalive: true,
  }).catch(() => undefined);
}
