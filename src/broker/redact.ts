const SENSITIVE_KEY =
  /^(token|access_token|refresh_token|authorization|secret|password|cookie|set-cookie|api_key|apikey)$/i;

const SECRET_VALUE =
  /^(gh[pousr]_|gho_|github_pat_|sk_live_|sk_test_|sk-ant-|rk_live_|rk_test_).{8,}/i;

const BEARER_VALUE = /^Bearer\s+\S+/i;

export const REDACTED = "[redacted]";

export function looksLikeSecret(value: string): boolean {
  const v = value.trim();
  return SECRET_VALUE.test(v) || BEARER_VALUE.test(v);
}

export function redact(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return looksLikeSecret(value) ? REDACTED : value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export function containsSecret(value: unknown): boolean {
  if (typeof value === "string") return looksLikeSecret(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k) && v != null && v !== REDACTED) return true;
      if (containsSecret(v)) return true;
    }
  }
  return false;
}

export function formatAuditLines(
  events: { ts: string; tool: string; decision: string; detail: string; http_status: number | null }[],
  secrets: string[],
): string {
  const lines = events.map((e) => {
    const status = e.http_status == null ? "-" : String(e.http_status);
    return `${e.ts}  ${e.decision.padEnd(14)}  ${status.padStart(3)}  ${e.tool}  ${e.detail}`;
  });
  let text = lines.join("\n");
  for (const secret of secrets) {
    if (secret && text.includes(secret)) {
      text = text.split(secret).join(REDACTED);
    }
  }
  return text;
}
