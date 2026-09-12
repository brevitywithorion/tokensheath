import { fetchInit, isRedirectStatus, REDIRECT_DENIED } from "./http.ts";

export type GithubHttp = {
  status: number;
  data: unknown;
  unauthorized: boolean;
  redirectDenied?: boolean;
};

export async function githubRequest(opts: {
  token: string;
  path: string;
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  fetchImpl?: typeof fetch;
}): Promise<GithubHttp> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = new URL(opts.path, "https://api.github.com");
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${opts.token}`,
    "User-Agent": "tokensheath",
  };
  const init: RequestInit = fetchInit({ method: opts.method ?? "GET", headers });
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetchImpl(url.toString(), init);
  if (isRedirectStatus(res.status)) {
    return {
      status: res.status,
      data: { message: REDIRECT_DENIED },
      unauthorized: false,
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
  return {
    status: res.status,
    data,
    unauthorized: res.status === 401,
  };
}

export async function githubUser(token: string, fetchImpl?: typeof fetch) {
  const res = await githubRequest({ token, path: "/user", fetchImpl });
  const login =
    res.data && typeof res.data === "object" && "login" in res.data
      ? String((res.data as { login: unknown }).login)
      : "github";
  return { ...res, login };
}

export function capPerPage(n: unknown, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(max, Math.floor(v));
}