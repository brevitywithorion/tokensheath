import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { AuditEvent } from "../broker/types.ts";
import { AuditLog } from "../broker/audit.ts";
import { auditPath } from "./home.ts";

export class FileAudit extends AuditLog {
  override append(event: Omit<AuditEvent, "ts"> & { ts?: string }): AuditEvent {
    const full = super.append(event);
    appendFileSync(auditPath(), `${JSON.stringify(full)}\n`, { encoding: "utf8" });
    return full;
  }

  static loadRecent(limit = 50): AuditEvent[] {
    if (!existsSync(auditPath())) return [];
    const lines = readFileSync(auditPath(), "utf8").split("\n").filter(Boolean);
    const parsed: AuditEvent[] = [];
    for (const line of lines.slice(-limit)) {
      try {
        parsed.push(JSON.parse(line) as AuditEvent);
      } catch {
        /* skip */
      }
    }
    return parsed;
  }
}
