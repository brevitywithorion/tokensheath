import { parseStaticMethod } from "./staticApi.ts";
import { resolveSameOriginUrl } from "./origin.ts";
import { GITHUB_READ_TOOLS, TOOL_LABELS, type Grant, type Ticket } from "./types.ts";
import type { Credential } from "./types.ts";

export const GITHUB_ORIGIN = "https://api.github.com";

export function isReadTool(tool: string, method?: string): boolean {
  if ((GITHUB_READ_TOOLS as readonly string[]).includes(tool)) return true;
  if (tool === "static.request" && (method ?? "GET").toUpperCase() === "GET") return true;
  return false;
}

export type RequestIntent = {
  tool: string;
  credId: string;
  method: string;
  origin: string;
  url: string;
  path: string;
  body?: unknown;
  fingerprint: string;
  read: boolean;
};

export function requestFingerprint(parts: {
  tool: string;
  method: string;
  url: string;
  body?: unknown;
}): string {
  const body = parts.body === undefined ? "" : JSON.stringify(parts.body);
  return `${parts.tool}\n${parts.method}\n${parts.url}\n${body}`;
}

export function shortFingerprint(fp: string): string {
  let h = 2166136261;
  for (let i = 0; i < fp.length; i++) {
    h ^= fp.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function knownTool(tool: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_LABELS, tool);
}

export function buildIntent(
  tool: string,
  args: Record<string, unknown>,
  cred: Credential,
): RequestIntent | { error: string; message: string } {
  if (!knownTool(tool)) {
    return { error: "unknown_tool", message: "Unknown tool. Default deny." };
  }

  if (tool.startsWith("github.")) {
    if (cred.kind !== "oauth_github") {
      return { error: "missing_cred", message: "No GitHub credential." };
    }
    const method = tool === "github.issues.comment" ? "POST" : "GET";
    let path = "/notifications";
    let url = `${GITHUB_ORIGIN}/notifications`;
    let body: unknown;
    if (tool === "github.issues.search") {
      const q = String(args.q ?? "");
      path = "/search/issues";
      url = `${GITHUB_ORIGIN}/search/issues?q=${encodeURIComponent(q)}`;
    }
    if (tool === "github.issues.comment") {
      const owner = String(args.owner ?? "").trim();
      const repo = String(args.repo ?? "").trim();
      const issue_number = Number(args.issue_number ?? 0);
      if (!owner || !repo || !Number.isInteger(issue_number) || issue_number <= 0) {
        return { error: "invalid_request", message: "Comment target is incomplete." };
      }
      path = `/repos/${owner}/${repo}/issues/${issue_number}/comments`;
      url = `${GITHUB_ORIGIN}${path}`;
      body = { body: String(args.body ?? "") };
    }
    const fingerprint = requestFingerprint({ tool, method, url, body });
    return {
      tool,
      credId: cred.id,
      method,
      origin: GITHUB_ORIGIN,
      url,
      path,
      body,
      fingerprint,
      read: isReadTool(tool, method),
    };
  }

  if (tool === "static.request") {
    if (cred.kind !== "static_key") {
      return { error: "missing_cred", message: "No saved service." };
    }
    const method = parseStaticMethod(args.method);
    if (!method) {
      return { error: "method_not_allowed", message: "method not allowed — MVP allows GET and POST only." };
    }
    const locked = resolveSameOriginUrl(cred.base_url, String(args.path ?? ""));
    if (!locked.ok) {
      return { error: "origin_denied", message: locked.message };
    }
    const body = method === "GET" ? undefined : args.json;
    const fingerprint = requestFingerprint({
      tool,
      method,
      url: locked.url.toString(),
      body,
    });
    return {
      tool,
      credId: cred.id,
      method,
      origin: locked.url.origin,
      url: locked.url.toString(),
      path: String(args.path ?? ""),
      body,
      fingerprint,
      read: method === "GET",
    };
  }

  return { error: "unknown_tool", message: "Unknown tool. Default deny." };
}

export function grantCovers(grant: Grant, intent: RequestIntent, now = Date.now()): boolean {
  if (grant.cred_id !== intent.credId) return false;
  if (grant.expires_at <= now) return false;
  if (grant.calls_used >= grant.max_calls) return false;
  if (grant.origin && grant.origin !== intent.origin) return false;
  if (grant.scope === "read") {
    return intent.read;
  }
  if (grant.fingerprint) return grant.fingerprint === intent.fingerprint;
  return grant.tool === intent.tool && !intent.read;
}

export function ticketMatches(ticket: Ticket, intent: RequestIntent): boolean {
  if (ticket.used) return false;
  if (ticket.tool !== intent.tool) return false;
  return ticket.fingerprint === intent.fingerprint;
}
