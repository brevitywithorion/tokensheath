import { applyHeaderTemplate } from "./store.ts";
import { resolveSameOriginUrl } from "./origin.ts";
import { fetchInit, isRedirectStatus, REDIRECT_DENIED } from "./http.ts";
import type { StaticCredential } from "./types.ts";

export const STATIC_METHODS = ["GET", "POST"] as const;
export type StaticMethod = (typeof STATIC_METHODS)[number];

export function parseStaticMethod(value: unknown): StaticMethod | null {
  const m = String(value ?? "GET").toUpperCase();
  if (m === "GET" || m === "POST") return m;
  return null;
}

export async function staticRequest(opts: {
  cred: StaticCredential;
  method: StaticMethod;
  path: string;
  query?: Record<string, unknown>;
  json?: unknown;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; data: unknown; url: string; called: boolean; redirectDenied?: boolean }> {
  const resolved = resolveSameOriginUrl(opts.cred.base_url, opts.path);
  if (!resolved.ok) {
    throw Object.assign(new Error(resolved.message), { code: "origin_denied", called: false });
  }
  const url = resolved.url;
  if (opts.query && typeof opts.query === "object") {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const headerName = opts.cred.header_name || "Authorization";
  headers[headerName] = applyHeaderTemplate(opts.cred.header_template, opts.cred.key);
  const init: RequestInit = fetchInit({ method: opts.method, headers });
  if (opts.method !== "GET" && opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.json);
  }
  const res = await fetchImpl(url.toString(), init);
  if (isRedirectStatus(res.status)) {
    return {
      status: res.status,
      data: { message: REDIRECT_DENIED },
      url: url.toString(),
      called: true,
      redirectDenied: true,
    };
  }
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 200) };
    }
  }
  return { status: res.status, data, url: url.toString(), called: true };
}