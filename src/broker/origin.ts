export type OriginResult =
  | { ok: true; url: URL }
  | { ok: false; error: "origin_denied"; message: string };

function ipv4Nums(hostname: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;
  const parts = hostname.split(".").map((p) => Number(p));
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

/** Literal private, loopback, link-local, and metadata hosts. DNS names are not resolved. */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") return true;
  if (h === "metadata.google.internal" || h.endsWith(".internal")) return true;
  if (h === "metadata" || h === "instance-data") return true;

  const v4 = ipv4Nums(h);
  if (v4) {
    const [a, b] = v4;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (h.includes(":")) {
    const ip = h.replace(/^\[|\]$/g, "");
    if (ip === "::1" || ip === "::") return true;
    if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
    if (ip.startsWith("::ffff:")) {
      const mapped = ip.slice("::ffff:".length);
      if (isBlockedHost(mapped)) return true;
    }
  }
  return false;
}

export function blockedHostMessage(hostname: string): string {
  return `Private or local address blocked (${hostname}). Enable local/dev if you meant this machine.`;
}

export function normalizeBaseUrl(
  input: string,
  opts: { requireHttps?: boolean; allowPrivate?: boolean; allowInsecure?: boolean } = {},
): OriginResult {
  const raw = input.trim();
  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  let base: URL;
  try {
    base = new URL(withProtocol);
  } catch {
    return { ok: false, error: "origin_denied", message: "Invalid credential base URL." };
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    return { ok: false, error: "origin_denied", message: "Base URL must be http or https." };
  }
  if (!base.hostname) {
    return { ok: false, error: "origin_denied", message: "Invalid credential base URL." };
  }
  const httpsOnly = opts.requireHttps || !opts.allowInsecure;
  if (httpsOnly && base.protocol !== "https:") {
    return { ok: false, error: "origin_denied", message: "This service requires https." };
  }
  if (!opts.allowPrivate && isBlockedHost(base.hostname)) {
    return { ok: false, error: "origin_denied", message: blockedHostMessage(base.hostname) };
  }
  base.username = "";
  base.password = "";
  return { ok: true, url: base };
}

export function resolveSameOriginUrl(
  baseUrl: string,
  path: string,
  opts: { allowPrivate?: boolean; allowInsecure?: boolean } = {},
): OriginResult {
  const normalized = normalizeBaseUrl(baseUrl, {
    allowPrivate: opts.allowPrivate,
    allowInsecure: opts.allowInsecure ?? true,
    requireHttps: false,
  });
  if (!normalized.ok) return normalized;
  const base = normalized.url;

  const trimmed = path.trim();
  if (!trimmed) {
    return { ok: false, error: "origin_denied", message: "Path is required." };
  }
  if (trimmed.startsWith("//") || trimmed.startsWith("\\\\")) {
    return { ok: false, error: "origin_denied", message: "Protocol-relative URLs are not allowed." };
  }
  if (trimmed.split(/[/\\]/).includes("..")) {
    return { ok: false, error: "origin_denied", message: "Path traversal is not allowed." };
  }

  let resolved: URL;
  try {
    resolved = new URL(trimmed, base);
  } catch {
    return { ok: false, error: "origin_denied", message: "Invalid request URL." };
  }

  if (resolved.username || resolved.password) {
    return { ok: false, error: "origin_denied", message: "URLs may not contain credentials." };
  }
  if (resolved.origin !== base.origin) {
    return { ok: false, error: "origin_denied", message: "Request must stay on the credential origin." };
  }
  if (!opts.allowPrivate && isBlockedHost(resolved.hostname)) {
    return { ok: false, error: "origin_denied", message: blockedHostMessage(resolved.hostname) };
  }
  return { ok: true, url: resolved };
}

export function applyQuery(url: URL, query?: Record<string, unknown>): URL {
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }
  return url;
}

export function composeStaticUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, unknown>,
  opts: { allowPrivate?: boolean; allowInsecure?: boolean } = {},
): OriginResult {
  const resolved = resolveSameOriginUrl(baseUrl, path, opts);
  if (!resolved.ok) return resolved;
  applyQuery(resolved.url, query);
  return resolved;
}

export function pathPrefixAllows(prefix: string, path: string): boolean {
  const p = path.split("?")[0] || "/";
  const pre = prefix.split("?")[0] || "";
  if (!pre) return true;
  return p === pre || p.startsWith(pre.endsWith("/") ? pre : `${pre}/`);
}
