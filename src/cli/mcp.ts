import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BrokerRuntime } from "../broker/runtime.ts";
import { GrantStore } from "../broker/grants.ts";
import { requestConsentBrowser } from "./consent-server.ts";
import { loadDiskStore, saveDiskStore } from "./disk-store.ts";
import { FileAudit } from "./file-audit.ts";
import { watchRevoke } from "./revoke-watch.ts";
import type { ToolResult } from "../broker/types.ts";

function pack(result: ToolResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    isError: !result.ok,
  };
}

export async function runMcp(): Promise<void> {
  const store = await loadDiskStore();
  const grants = new GrantStore();
  const audit = new FileAudit();
  watchRevoke(grants, () => {
    process.stderr.write("TokenSheath: all grants revoked\n");
  });

  const runtime = new BrokerRuntime({
    store,
    grants,
    audit,
    agentName: "Cursor",
    githubFetch: fetch,
    staticFetch: fetch,
    hooks: {
      requestConsent: (req) => requestConsentBrowser(req, "Cursor"),
      requestGithubReconnect: async () => false,
    },
  });

  const server = new McpServer({
    name: "tokensheath",
    version: "0.1.0",
  });

  server.registerTool(
    "static.request",
    {
      title: "Call the saved service",
      description:
        "Perform GET or POST against the saved service origin only. The credential is injected by TokenSheath and never returned.",
      inputSchema: {
        method: z.enum(["GET", "POST"]).optional(),
        path: z.string(),
        service: z.string().optional(),
        query: z.record(z.string(), z.unknown()).optional(),
        json: z.unknown().optional(),
      },
    },
    async (args) => {
      const result = await runtime.invoke("static.request", args as Record<string, unknown>);
      await saveDiskStore(store);
      return pack(result);
    },
  );

  server.registerTool(
    "github.notifications.list",
    {
      title: "List GitHub notifications",
      description: "List notifications for the sheathed GitHub credential.",
      inputSchema: { per_page: z.number().optional() },
    },
    async (args) => pack(await runtime.invoke("github.notifications.list", args as Record<string, unknown>)),
  );

  server.registerTool(
    "github.issues.search",
    {
      title: "Search GitHub issues",
      description: "Search issues. GitHub token stays in TokenSheath.",
      inputSchema: { q: z.string(), per_page: z.number().optional() },
    },
    async (args) => pack(await runtime.invoke("github.issues.search", args as Record<string, unknown>)),
  );

  server.registerTool(
    "github.issues.comment",
    {
      title: "Comment on a GitHub issue",
      description: "Write a comment. Requires per-action approval.",
      inputSchema: {
        owner: z.string(),
        repo: z.string(),
        issue_number: z.number(),
        body: z.string(),
      },
    },
    async (args) => pack(await runtime.invoke("github.issues.comment", args as Record<string, unknown>)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
