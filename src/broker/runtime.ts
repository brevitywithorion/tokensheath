import { AuditLog } from "./audit.ts";
import { GrantStore, isReadTool } from "./grants.ts";
import { capPerPage, githubRequest } from "./github.ts";
import { parseStaticMethod, staticRequest } from "./staticApi.ts";
import { resolveSameOriginUrl } from "./origin.ts";
import { containsSecret, redact } from "./redact.ts";
import { riskFor } from "./risk.ts";
import { REDIRECT_DENIED } from "./http.ts";
import { credForTool, type MemoryStore } from "./store.ts";
import {
  CONSENT_TIMEOUT_MS,
  TOOL_LABELS,
  type ConsentChoice,
  type ConsentPreview,
  type ConsentRequest,
  type ToolResult,
} from "./types.ts";
import { id } from "./ids.ts";

export type RuntimeHooks = {
  requestConsent: (req: ConsentRequest) => Promise<ConsentChoice | "timeout">;
  requestGithubReconnect: () => Promise<boolean>;
};

export class BrokerRuntime {
  store: MemoryStore;
  grants: GrantStore;
  audit: AuditLog;
  sessionId: string;
  agentName: string;
  githubFetch: typeof fetch;
  staticFetch: typeof fetch;
  hooks: RuntimeHooks;
  modelTrace: { tool: string; ticket?: string; result: unknown }[] = [];

  constructor(opts: {
    store: MemoryStore;
    grants?: GrantStore;
    audit?: AuditLog;
    sessionId?: string;
    agentName?: string;
    githubFetch: typeof fetch;
    staticFetch: typeof fetch;
    hooks: RuntimeHooks;
  }) {
    this.store = opts.store;
    this.grants = opts.grants ?? new GrantStore();
    this.audit = opts.audit ?? new AuditLog();
    this.sessionId = opts.sessionId ?? id("ses");
    this.agentName = opts.agentName ?? "MCP client";
    this.githubFetch = opts.githubFetch;
    this.staticFetch = opts.staticFetch;
    this.hooks = opts.hooks;
  }

  modelView() {
    return {
      agent: this.agentName,
      tools: Object.keys(TOOL_LABELS),
      tickets: this.modelTrace.map((t) => t.ticket).filter(Boolean),
      lastResults: this.modelTrace.slice(-6),
      secretsVisible: this.modelTrace.some((t) => containsSecret(t.result)),
    };
  }

  revokeAll(): void {
    this.grants.revokeAll();
    this.audit.append({
      tool: "*",
      cred_id: "-",
      ticket: "-",
      decision: "revoked",
      http_status: null,
      detail: "revoke --all",
    });
  }

  async invoke(tool: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    try {
      return await this.invokeInner(tool, args);
    } catch {
      return { ok: false, error: "internal" };
    }
  }

  private async invokeInner(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
    const cred = credForTool(this.store, tool);
    if (!cred) {
      this.audit.append({
        tool,
        cred_id: "-",
        ticket: "-",
        decision: "denied",
        http_status: null,
        detail: "missing credential — run onboard",
      });
      const result: ToolResult = {
        ok: false,
        error: "missing_cred",
        message: "No matching credential. Run broker onboard.",
      };
      this.modelTrace.push({ tool, result });
      return result;
    }

    if (tool === "static.request") {
      const method = parseStaticMethod(args.method);
      if (!method) {
        const result: ToolResult = {
          ok: false,
          error: "method_not_allowed",
          message: "MVP allows GET and POST only.",
        };
        this.audit.append({
          tool,
          cred_id: cred.id,
          ticket: "-",
          decision: "denied",
          http_status: null,
          detail: `method ${String(args.method)} rejected`,
        });
        this.modelTrace.push({ tool, result });
        return result;
      }
      if (cred.kind !== "static_key") {
        return { ok: false, error: "missing_cred" };
      }
      const locked = resolveSameOriginUrl(cred.base_url, String(args.path ?? ""));
      if (!locked.ok) {
        this.audit.append({
          tool,
          cred_id: cred.id,
          ticket: "-",
          decision: "denied",
          http_status: null,
          detail: locked.message,
        });
        const result: ToolResult = { ok: false, error: "origin_denied", message: locked.message };
        this.modelTrace.push({ tool, result });
        return result;
      }
    }

    const method =
      tool === "static.request" ? parseStaticMethod(args.method) ?? undefined : undefined;
    let grant = this.grants.find(this.sessionId, tool, cred.id, method);
    let decision: "allow_once" | "allow_session" | null = grant
      ? grant.mode === "once"
        ? "allow_once"
        : "allow_session"
      : null;

    if (!grant) {
      const preview = this.previewFor(tool, args, cred.kind === "static_key" ? cred.base_url : "");
      const req: ConsentRequest = {
        id: id("cns"),
        nonce: id("k").slice(2),
        agentName: this.agentName,
        tool,
        toolLabel: TOOL_LABELS[tool] ?? tool,
        credNickname: cred.nickname,
        credId: cred.id,
        preview,
        risk: riskFor(tool, method),
        createdAt: Date.now(),
      };
      const choice = await this.withTimeout(this.hooks.requestConsent(req), CONSENT_TIMEOUT_MS);
      if (choice === "timeout") {
        this.audit.append({
          tool,
          cred_id: cred.id,
          ticket: "-",
          decision: "timeout",
          http_status: null,
          detail: TOOL_LABELS[tool] ?? tool,
        });
        const result: ToolResult = { ok: false, error: "consent_timeout" };
        this.modelTrace.push({ tool, result });
        return result;
      }
      if (choice === "deny") {
        this.audit.append({
          tool,
          cred_id: cred.id,
          ticket: "-",
          decision: "denied",
          http_status: null,
          detail: TOOL_LABELS[tool] ?? tool,
        });
        const result: ToolResult = { ok: false, error: "denied" };
        this.modelTrace.push({ tool, result });
        return result;
      }
      const write = !isReadTool(tool, method);
      const mode = write || choice === "allow_once" ? "once" : "session";
      grant = this.grants.create({
        sessionId: this.sessionId,
        credId: cred.id,
        tool,
        mode,
        method,
      });
      decision = mode === "once" ? "allow_once" : "allow_session";
    }

    const ticket = this.grants.issueTicket(grant, tool);
    this.grants.consume(grant);

    const executed = await this.execute(tool, args, true);
    if (executed.redirectDenied) {
      this.audit.append({
        tool,
        cred_id: cred.id,
        ticket: ticket.id,
        decision: "denied",
        http_status: executed.status,
        detail: "redirect refused",
      });
      const result: ToolResult = { ok: false, error: "redirect_denied", message: REDIRECT_DENIED };
      this.modelTrace.push({ tool, ticket: ticket.id, result });
      return result;
    }
    if (executed.retryAuth) {
      this.store.clearGithubToken();
      this.audit.append({
        tool,
        cred_id: cred.id,
        ticket: ticket.id,
        decision: "reconnect",
        http_status: 401,
        detail: "GitHub token rejected; reconnect required",
      });
      const ok = await this.hooks.requestGithubReconnect();
      if (!ok || !this.store.github()?.access_token) {
        const result: ToolResult = { ok: false, error: "reconnect_required" };
        this.modelTrace.push({ tool, ticket: ticket.id, result });
        return result;
      }
      const retried = await this.execute(tool, args, false);
      if (retried.redirectDenied) {
        const result: ToolResult = { ok: false, error: "redirect_denied", message: REDIRECT_DENIED };
        this.modelTrace.push({ tool, ticket: ticket.id, result });
        return result;
      }
      return this.finish(tool, cred.id, ticket.id, decision!, retried.detail, retried.status, retried.data);
    }
    return this.finish(tool, cred.id, ticket.id, decision!, executed.detail, executed.status, executed.data);
  }

  private finish(
    tool: string,
    credId: string,
    ticket: string,
    decision: "allow_once" | "allow_session",
    detail: string,
    status: number,
    data: unknown,
  ): ToolResult {
    const redacted = redact(data);
    this.audit.append({
      tool,
      cred_id: credId,
      ticket,
      decision,
      http_status: status,
      detail,
    });
    const result: ToolResult =
      status >= 200 && status < 300
        ? { ok: true, request_id: ticket, status, data: redacted }
        : { ok: false, error: "http_error", message: shortMessage(redacted, status) };
    this.modelTrace.push({ tool, ticket, result });
    return result;
  }

  private previewFor(tool: string, args: Record<string, unknown>, baseUrl: string): ConsentPreview {
    if (tool === "github.issues.comment") {
      return {
        kind: "github_comment",
        owner: String(args.owner ?? ""),
        repo: String(args.repo ?? ""),
        issue_number: Number(args.issue_number ?? 0),
        body: String(args.body ?? ""),
      };
    }
    if (tool === "static.request") {
      const method = String(args.method ?? "GET").toUpperCase();
      const resolved = resolveSameOriginUrl(baseUrl, String(args.path ?? ""));
      const url = resolved.ok ? resolved.url.toString() : String(args.path ?? "");
      return {
        kind: "static",
        method,
        url,
        json: args.json,
        isWrite: method !== "GET",
      };
    }
    return { kind: "github_read", summary: TOOL_LABELS[tool] ?? tool };
  }

  private async execute(
    tool: string,
    args: Record<string, unknown>,
    allowRetryFlag: boolean,
  ): Promise<{
    status: number;
    data: unknown;
    detail: string;
    retryAuth: boolean;
    redirectDenied?: boolean;
  }> {
    if (tool.startsWith("github.")) {
      const token = this.store.github()?.access_token ?? "";
      if (tool === "github.notifications.list") {
        const per_page = capPerPage(args.per_page, 50, 20);
        const res = await githubRequest({
          token,
          path: "/notifications",
          query: { per_page },
          fetchImpl: this.githubFetch,
        });
        return {
          status: res.status,
          data: res.data,
          detail: "GET /notifications",
          retryAuth: allowRetryFlag && res.unauthorized,
          redirectDenied: res.redirectDenied,
        };
      }
      if (tool === "github.issues.search") {
        const per_page = capPerPage(args.per_page, 20, 10);
        const q = String(args.q ?? "");
        const res = await githubRequest({
          token,
          path: "/search/issues",
          query: { q, per_page },
          fetchImpl: this.githubFetch,
        });
        return {
          status: res.status,
          data: res.data,
          detail: `GET /search/issues q=${q.slice(0, 80)}`,
          retryAuth: allowRetryFlag && res.unauthorized,
          redirectDenied: res.redirectDenied,
        };
      }
      if (tool === "github.issues.comment") {
        const owner = String(args.owner ?? "");
        const repo = String(args.repo ?? "");
        const issue_number = Number(args.issue_number ?? 0);
        const res = await githubRequest({
          token,
          path: `/repos/${owner}/${repo}/issues/${issue_number}/comments`,
          method: "POST",
          body: { body: String(args.body ?? "") },
          fetchImpl: this.githubFetch,
        });
        return {
          status: res.status,
          data: res.data,
          detail: `POST /repos/${owner}/${repo}/issues/${issue_number}/comments`,
          retryAuth: allowRetryFlag && res.unauthorized,
          redirectDenied: res.redirectDenied,
        };
      }
    }
    if (tool === "static.request") {
      const cred = this.store.staticKey();
      if (!cred) return { status: 0, data: { error: "missing" }, detail: "missing", retryAuth: false };
      const method = parseStaticMethod(args.method) ?? "GET";
      const path = String(args.path ?? "");
      const out = await staticRequest({
        cred,
        method,
        path,
        query: args.query as Record<string, unknown> | undefined,
        json: args.json,
        fetchImpl: this.staticFetch,
      });
      return {
        status: out.status,
        data: out.data,
        detail: `${method} ${out.url.replace(/^https?:\/\/[^/]+/, "") || path}`,
        retryAuth: false,
        redirectDenied: out.redirectDenied,
      };
    }
    return { status: 400, data: { error: "unknown_tool" }, detail: tool, retryAuth: false };
  }

  private async withTimeout(
    promise: Promise<ConsentChoice | "timeout">,
    ms: number,
  ): Promise<ConsentChoice | "timeout"> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function shortMessage(data: unknown, status: number): string {
  if (data && typeof data === "object" && "message" in data) {
    return String((data as { message: unknown }).message).slice(0, 180);
  }
  return `HTTP ${status}`;
}
