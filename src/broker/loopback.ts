/** Exact loopback hostname (port allowed). Rejects 127.0.0.1.evil.example. */
export function loopbackHostname(hostHeader: string | undefined): string | null {
  const raw = (hostHeader ?? "").trim().toLowerCase();
  if (!raw) return null;
  let hostname = raw;
  if (hostname.startsWith("[")) {
    const end = hostname.indexOf("]");
    if (end === -1) return null;
    hostname = hostname.slice(1, end);
  } else {
    hostname = hostname.split(":")[0] ?? "";
  }
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1") return hostname;
  return null;
}

export function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
  return loopbackHostname(hostHeader) !== null;
}

export function isLoopbackAbsoluteUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return loopbackHostname(u.host) !== null;
  } catch {
    return false;
  }
}

/**
 * Browser CSRF: if Origin / Referer / Sec-Fetch-Site say this is a foreign page, deny.
 * Native agents (PowerShell, Grok Build helper) send none of those — allowed.
 */
export function allowLocalPost(headers: { origin?: string; referer?: string; "sec-fetch-site"?: string }): boolean {
  const site = (headers["sec-fetch-site"] ?? "").toLowerCase();
  if (site === "cross-site") return false;
  if (headers.origin) return isLoopbackAbsoluteUrl(headers.origin);
  if (headers.referer) return isLoopbackAbsoluteUrl(headers.referer);
  return true;
}
