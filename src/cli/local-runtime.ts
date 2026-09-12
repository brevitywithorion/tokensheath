import { BrokerRuntime } from "../broker/runtime.ts";
import { GrantStore } from "../broker/grants.ts";
import { requestConsentBrowser } from "./consent-server.ts";
import { loadDiskStore } from "./disk-store.ts";
import { FileAudit } from "./file-audit.ts";
import { watchRevoke } from "./revoke-watch.ts";

export async function localRuntime(agentName: string) {
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
    agentName,
    githubFetch: fetch,
    staticFetch: fetch,
    hooks: {
      requestConsent: (req) => requestConsentBrowser(req, agentName),
      requestGithubReconnect: async () => false,
    },
  });
  return { store, grants, audit, runtime };
}
