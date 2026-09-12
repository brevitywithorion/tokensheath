import type { AuditEvent } from "./types.ts";
import { formatAuditLines } from "./redact.ts";

export class AuditLog {
  events: AuditEvent[] = [];

  append(event: Omit<AuditEvent, "ts"> & { ts?: string }): AuditEvent {
    const full: AuditEvent = {
      ...event,
      ts: event.ts ?? new Date().toISOString(),
    };
    this.events.push(full);
    return full;
  }

  recent(limit = 50): AuditEvent[] {
    return this.events.slice(-limit);
  }

  format(secrets: string[] = [], limit = 50): string {
    const rows = this.recent(limit).reverse();
    return formatAuditLines(rows, secrets);
  }
}
