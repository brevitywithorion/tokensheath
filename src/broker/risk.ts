import { isReadTool } from "./grants.ts";

export type RiskLevel = "read" | "write" | "destructive";

export function riskFor(tool: string, method?: string): RiskLevel {
  const m = (method ?? "GET").toUpperCase();
  if (m === "DELETE") return "destructive";
  if (isReadTool(tool, method)) return "read";
  return "write";
}
