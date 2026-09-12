import { decryptJson, encryptJson, hexToKey, keyToHex, randomKeyBytes } from "./crypto.ts";
import { id } from "./ids.ts";
import type { Credential, Store, StaticCredential, GithubCredential } from "./types.ts";

export function emptyStore(): Store {
  return { version: 1, creds: [] };
}

export class MemoryStore {
  store: Store;
  masterKey: Uint8Array;

  constructor(store: Store = emptyStore(), masterKey: Uint8Array = randomKeyBytes()) {
    this.store = store;
    this.masterKey = masterKey;
  }

  secrets(): string[] {
    const out: string[] = [];
    for (const c of this.store.creds) {
      if (c.kind === "oauth_github") out.push(c.access_token);
      if (c.kind === "static_key") out.push(c.key);
    }
    return out.filter(Boolean);
  }

  github(): GithubCredential | undefined {
    return this.store.creds.find((c): c is GithubCredential => c.kind === "oauth_github");
  }

  staticKeys(): StaticCredential[] {
    return this.store.creds.filter((c): c is StaticCredential => c.kind === "static_key");
  }

  staticKey(name?: string): StaticCredential | undefined {
    const all = this.staticKeys();
    if (name && name.trim()) {
      const n = name.trim().toLowerCase();
      return all.find((c) => c.nickname.toLowerCase() === n || c.id === name.trim());
    }
    return all.length === 1 ? all[0] : undefined;
  }

  byId(id: string): Credential | undefined {
    return this.store.creds.find((c) => c.id === id);
  }

  publicCreds(): { id: string; kind: string; nickname: string; extra: string }[] {
    return this.store.creds.map((c) => ({
      id: c.id,
      kind: c.kind,
      nickname: c.nickname,
      extra: c.kind === "oauth_github" ? c.account_login : c.base_url,
    }));
  }

  upsertGithub(input: Omit<GithubCredential, "id" | "kind" | "created_at"> & { id?: string }): GithubCredential {
    const existing = this.github();
    const cred: GithubCredential = {
      id: input.id ?? existing?.id ?? id("crd"),
      kind: "oauth_github",
      nickname: input.nickname,
      account_login: input.account_login,
      access_token: input.access_token,
      token_type: input.token_type,
      created_at: existing?.created_at ?? new Date().toISOString(),
    };
    this.store.creds = this.store.creds.filter((c) => c.kind !== "oauth_github");
    this.store.creds.push(cred);
    return cred;
  }

  upsertStatic(input: Omit<StaticCredential, "id" | "kind" | "created_at"> & { id?: string }): StaticCredential {
    const nickname = input.nickname.trim() || "my service";
    const existing =
      (input.id ? this.staticKeys().find((c) => c.id === input.id) : undefined) ??
      this.staticKeys().find((c) => c.nickname.toLowerCase() === nickname.toLowerCase());
    const cred: StaticCredential = {
      id: input.id ?? existing?.id ?? id("crd"),
      kind: "static_key",
      nickname,
      header_name: input.header_name || "Authorization",
      header_template: input.header_template || "Bearer {{key}}",
      base_url: input.base_url,
      key: input.key,
      created_at: existing?.created_at ?? new Date().toISOString(),
      allow_private: input.allow_private,
      allow_insecure: input.allow_insecure,
    };
    this.store.creds = this.store.creds.filter((c) => !(c.kind === "static_key" && c.id === cred.id));
    this.store.creds.push(cred);
    return cred;
  }

  clearGithubToken(): void {
    const g = this.github();
    if (g) g.access_token = "";
  }

  async snapshot(): Promise<{ keyHex: string; blob: string }> {
    return {
      keyHex: keyToHex(this.masterKey),
      blob: await encryptJson(this.masterKey, this.store),
    };
  }

  static async restore(keyHex: string, blob: string): Promise<MemoryStore> {
    const key = hexToKey(keyHex);
    const store = await decryptJson<Store>(key, blob);
    if (!store || store.version !== 1 || !Array.isArray(store.creds)) {
      throw new Error("invalid store");
    }
    return new MemoryStore(store, key);
  }
}

export function applyHeaderTemplate(template: string, key: string): string {
  return template.replaceAll("{{key}}", key);
}

export function credForTool(
  store: MemoryStore,
  tool: string,
  service?: string,
): Credential | undefined {
  if (tool.startsWith("github.")) return store.github();
  if (tool === "static.request") return store.staticKey(service);
  return undefined;
}

export function missingCredMessage(store: MemoryStore, tool: string, service?: string): string {
  if (tool === "static.request") {
    const names = store.staticKeys().map((c) => c.nickname);
    if (!names.length) return "No saved service. Open TokenSheath and add one.";
    if (service) return `No service named "${service}". Saved: ${names.join(", ")}.`;
    if (names.length > 1) return `Say which service: ${names.join(", ")}.`;
  }
  return "No matching credential. Open TokenSheath and add one.";
}
