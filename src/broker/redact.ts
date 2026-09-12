const SENSITIVE_KEY =
  /secret|password|passwd|token|authorization|cookie|api[_-]?key|private[_-]?key|^jwt$/i;

const SECRET_VALUE =
  /(gh[pousr]_|gho_|github_pat_|sk_live_|sk_test_|sk-ant-|sk-proj-|sk-[a-zA-Z0-9_-]{16,}|rk_live_|rk_test_|whsec_|xox[baprs]-|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{10,})/i;

const BEARER_VALUE = /^Bearer\s+\S+/i;

export const REDACTED = "[redacted]";

export function looksLikeSecret(value: string): boolean {
  const v = value.trim();
  return SECRET_VALUE.test(v) || BEARER_VALUE.test(v);
}

export function redact(value: unknown, extraSecrets: string[] = []): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (looksLikeSecret(value)) return REDACTED;
    let out = value;
    for (const secret of extraSecrets) {
      if (secret && out.includes(secret)) out = out.split(secret).join(REDACTED);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, extraSecrets));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redact(v, extraSecrets);
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
