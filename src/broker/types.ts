export type GithubCredential = {
  id: string;
  kind: "oauth_github";
  nickname: string;
  account_login: string;
  access_token: string;
  token_type: string;
  created_at: string;
};

export type StaticCredential = {
  id: string;
  kind: "static_key";
  nickname: string;
  header_name: string;
  header_template: string;
  base_url: string;
  key: string;
  created_at: string;
  allow_private?: boolean;
  allow_insecure?: boolean;
};

export type Credential = GithubCredential | StaticCredential;

export type Store = {
  version: 1;
  creds: Credential[];
};

export type Grant = {
  id: string;
  cred_id: string;
  tool: string;
  scope: "tool" | "read";
  mode: "once" | "session";
  expires_at: number;
  max_calls: number;
  calls_used: number;
  session_id: string;
  origin: string;
  fingerprint: string;
  path_prefix: string;
};

export type Ticket = {
  id: string;
  grant_id: string;
  tool: string;
  fingerprint: string;
  used: boolean;
};

export type AuditDecision =
  | "allow_once"
  | "allow_session"
  | "denied"
  | "timeout"
  | "revoked"
  | "reconnect";

export type AuditEvent = {
  ts: string;
  tool: string;
  cred_id: string;
  ticket: string;
  decision: AuditDecision;
  http_status: number | null;
  detail: string;
};

export type ConsentChoice = "deny" | "allow_once" | "allow_session";

export type ConsentRequest = {
  id: string;
  nonce: string;
  agentName: string;
  tool: string;
  toolLabel: string;
  credNickname: string;
  credId: string;
  preview: ConsentPreview;
  risk: "read" | "write" | "destructive";
  createdAt: number;
  fingerprint: string;
  origin: string;
};

export type ConsentPreview =
  | { kind: "github_read"; summary: string }
  | {
      kind: "github_comment";
      owner: string;
      repo: string;
      issue_number: number;
      body: string;
    }
  | {
      kind: "static";
      method: string;
      url: string;
      json?: unknown;
      isWrite: boolean;
    };

export type ToolSuccess = {
  ok: true;
  request_id: string;
  status: number;
  data: unknown;
};

export type ToolFailure = {
  ok: false;
  error: string;
  message?: string;
};

export type ToolResult = ToolSuccess | ToolFailure;

export const SESSION_MS = 15 * 60 * 1000;
export const SESSION_CALLS = 20;
export const CONSENT_TIMEOUT_MS = 120_000;

export function sessionGrantLabel(origin?: string, path?: string): string {
  let host = "";
  let p = (path ?? "").split("?")[0];
  if (origin) {
    try {
      const u = origin.includes("://") ? new URL(origin) : new URL(`https://${origin}`);
      host = u.host;
      if (!p) p = u.pathname;
    } catch {
      host = origin.replace(/^https?:\/\//, "").split("/")[0] ?? origin;
    }
  }
  const place = host ? `${host}${p && p !== "/" ? p : ""}` : "this origin";
  return `15 min · 20 calls · ${place} · this path prefix · reads only`;
}

export const GITHUB_READ_TOOLS = [
  "github.notifications.list",
  "github.issues.search",
] as const;

export const TOOL_LABELS: Record<string, string> = {
  "github.notifications.list": "List GitHub notifications",
  "github.issues.search": "Search GitHub issues",
  "github.issues.comment": "Comment on a GitHub issue",
  "static.request": "Call the saved service",
};
