export type OriginResult =
  | { ok: true; url: URL }
  | { ok: false; error: "origin_denied"; message: string };

export function resolveSameOriginUrl(baseUrl: string, path: string): OriginResult {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return { ok: false, error: "origin_denied", message: "Invalid credential base URL." };
  }

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
