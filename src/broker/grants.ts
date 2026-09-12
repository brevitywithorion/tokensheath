import { id } from "./ids.ts";
import {
  GITHUB_READ_TOOLS,
  SESSION_CALLS,
  SESSION_MS,
  type Grant,
  type Ticket,
} from "./types.ts";

export function isReadTool(tool: string, method?: string): boolean {
  if ((GITHUB_READ_TOOLS as readonly string[]).includes(tool)) return true;
  if (tool === "static.request" && (method ?? "GET").toUpperCase() === "GET") return true;
  return false;
}

export class GrantStore {
  grants: Grant[] = [];
  tickets: Ticket[] = [];

  find(sessionId: string, tool: string, credId: string, method?: string): Grant | undefined {
    const now = Date.now();
    const read = isReadTool(tool, method);
    return this.grants.find((g) => {
      if (g.session_id !== sessionId) return false;
      if (g.cred_id !== credId) return false;
      if (g.expires_at <= now) return false;
      if (g.calls_used >= g.max_calls) return false;
      if (g.scope === "read") return read;
      return g.tool === tool;
    });
  }

  create(input: {
    sessionId: string;
    credId: string;
    tool: string;
    mode: "once" | "session";
    method?: string;
  }): Grant {
    const read = isReadTool(input.tool, input.method);
    const grant: Grant = {
      id: id("grn"),
      cred_id: input.credId,
      tool: input.tool,
      scope: input.mode === "session" && read ? "read" : "tool",
      mode: input.mode,
      expires_at: Date.now() + SESSION_MS,
      max_calls: input.mode === "once" ? 1 : SESSION_CALLS,
      calls_used: 0,
      session_id: input.sessionId,
    };
    this.grants.push(grant);
    return grant;
  }

  issueTicket(grant: Grant, tool: string): Ticket {
    const ticket: Ticket = { id: id("tkt"), grant_id: grant.id, tool };
    this.tickets.push(ticket);
    return ticket;
  }

  consume(grant: Grant): void {
    grant.calls_used += 1;
  }

  revokeAll(): number {
    const n = this.grants.length;
    this.grants = [];
    this.tickets = [];
    return n;
  }

  activeCount(): number {
    const now = Date.now();
    return this.grants.filter((g) => g.expires_at > now && g.calls_used < g.max_calls).length;
  }
}
