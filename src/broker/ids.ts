export function id(prefix: string, bytes = 6): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}
