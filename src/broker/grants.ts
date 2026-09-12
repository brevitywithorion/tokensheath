import { id } from "./ids.ts";
import { grantCovers, isReadTool, ticketMatches, type RequestIntent } from "./policy.ts";
import { SESSION_CALLS, SESSION_MS, type Grant, type Ticket } from "./types.ts";

export { isReadTool };

export class GrantStore {
  grants: Grant[] = [];
  tickets: Ticket[] = [];

  find(sessionId: string, intent: RequestIntent): Grant | undefined {
    return this.grants.find((g) => g.session_id === sessionId && grantCovers(g, intent));
  }

  create(input: {
    sessionId: string;
    credId: string;
    tool: string;
    mode: "once" | "session";
    method?: string;
    origin: string;
    fingerprint: string;
    pathPrefix?: string;
  }): Grant {
    const read = isReadTool(input.tool, input.method);
    const session = input.mode === "session" && read;
    const grant: Grant = {
      id: id("grn"),
      cred_id: input.credId,
      tool: input.tool,
      scope: session ? "read" : "tool",
      mode: session ? "session" : "once",
      expires_at: Date.now() + SESSION_MS,
      max_calls: session ? SESSION_CALLS : 1,
      calls_used: 0,
      session_id: input.sessionId,
      origin: input.origin,
      fingerprint: session ? "" : input.fingerprint,
      path_prefix: session && input.tool === "static.request" ? input.pathPrefix || "" : "",
    };
    this.grants.push(grant);
    return grant;
  }

  issueTicket(grant: Grant, intent: RequestIntent): Ticket {
    const ticket: Ticket = {
      id: id("tkt"),
      grant_id: grant.id,
      tool: intent.tool,
      fingerprint: intent.fingerprint,
      used: false,
    };
    this.tickets.push(ticket);
    return ticket;
  }

  takeTicket(ticketId: string, intent: RequestIntent): Ticket | undefined {
    const ticket = this.tickets.find((t) => t.id === ticketId);
    if (!ticket || !ticketMatches(ticket, intent)) return undefined;
    ticket.used = true;
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
