export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public reauthUrl?: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, contentType = "application/json"): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    // Personal data (and card secrets): never use the HTTP cache.
    cache: "no-store",
    headers: body !== undefined ? { "Content-Type": contentType } : undefined,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  // Cloudflare Access session expired -> the edge redirects to the login page.
  if (res.redirected && !res.url.includes("/api/")) {
    window.location.reload();
    throw new ApiError("Session expired", 401);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.ok ? "Invalid server response" : `HTTP ${res.status}`, res.status);
  }
  if (!res.ok) throw new ApiError(data?.error ?? `HTTP ${res.status}`, res.status, data?.code, data?.reauthUrl);
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  postRaw: <T>(p: string, b: string, type: string) => request<T>("POST", p, b, type),
  patch: <T>(p: string, b: unknown) => request<T>("PATCH", p, b),
  del: <T>(p: string) => request<T>("DELETE", p),
  put: <T>(p: string, b: unknown) => request<T>("PUT", p, b),
};
