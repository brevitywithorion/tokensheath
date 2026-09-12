#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "src", "cli", "main.ts");
const child = spawn(
  process.execPath,
  ["--experimental-strip-types", entry, ...process.argv.slice(2)],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  },
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
child.on("error", (err) => {
  process.stderr.write(`${err instanceof Error ? err.message : "failed to start TokenSheath"}\n`);
  process.stderr.write("Need Node.js 22+.\n");
  process.exit(1);
});
