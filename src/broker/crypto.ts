function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomKeyBytes(): Uint8Array {
  const key = new Uint8Array(32);
  globalThis.crypto.getRandomValues(key);
  return key;
}

export function keyToHex(key: Uint8Array): string {
  return Array.from(key, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToKey(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length !== 64 || /[^0-9a-f]/i.test(clean)) {
    throw new Error("invalid master key");
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(key: Uint8Array, value: unknown): Promise<string> {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const cryptoKey = await importKey(key);
  const ct = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoded),
  );
  return `${bytesToB64(iv)}.${bytesToB64(ct)}`;
}

export async function decryptJson<T>(key: Uint8Array, blob: string): Promise<T> {
  const [ivB64, ctB64] = blob.split(".");
  if (!ivB64 || !ctB64) throw new Error("invalid ciphertext");
  const iv = b64ToBytes(ivB64);
  const ct = b64ToBytes(ctB64);
  const cryptoKey = await importKey(key);
  const pt = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    cryptoKey,
    ct as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
