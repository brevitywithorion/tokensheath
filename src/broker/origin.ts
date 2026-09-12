export type OriginResult =
  | { ok: true; url: URL }
  | { ok: false; error: "origin_denied"; message: string };

export function normalizeBaseUrl(input: string): OriginResult {
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
  base.username = "";
  base.password = "";
  return { ok: true, url: base };
}

export function resolveSameOriginUrl(baseUrl: string, path: string): OriginResult {
  const normalized = normalizeBaseUrl(baseUrl);
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
  return { ok: true, url: resolved };
}

