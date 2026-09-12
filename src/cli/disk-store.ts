import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { MemoryStore } from "../broker/store.ts";
import { hexToKey, keyToHex, randomKeyBytes } from "../broker/crypto.ts";
import { keyPath, storePath } from "./home.ts";

function writePrivate(path: string, data: string): void {
  writeFileSync(path, data, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

export async function loadDiskStore(): Promise<MemoryStore> {
  const kp = keyPath();
  const sp = storePath();
  if (!existsSync(kp) || !existsSync(sp)) {
    const store = new MemoryStore();
    await saveDiskStore(store);
    return store;
  }
  const keyHex = readFileSync(kp, "utf8").trim();
  const blob = readFileSync(sp, "utf8").trim();
  return MemoryStore.restore(keyHex, blob);
}

export async function saveDiskStore(store: MemoryStore): Promise<void> {
  const snap = await store.snapshot();
  writePrivate(keyPath(), snap.keyHex);
  writePrivate(storePath(), snap.blob);
}

export function newMasterKeyHex(): string {
  return keyToHex(randomKeyBytes());
}

export function parseMasterKey(hex: string): Uint8Array {
  return hexToKey(hex);
}
