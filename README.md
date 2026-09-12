# TokenSheath

**The model never sees the key.**

Local credential broker for agents. The agent requests an action. You approve it. TokenSheath injects the credential on the wire. The model never holds the secret.

Need **Node.js 22+**. Windows, macOS, and Linux.

## Threat model

TokenSheath protects **model context**. Tool args, tool results, and the audit log must not contain the key.

It does **not** protect a same-user process with a shell. Coding agents can read files. If they can open `~/.tokensheath`, they can read the store. That is documented, not a bug.

## What it does

- **At rest:** AES-GCM. `master.key` is mode 0600.
- **On the wire:** origin lock. Redirects refused. MVP methods: GET and POST.
- **Consent:** reads may be once, or a session of **15 min · 20 calls · this origin · reads only**. Writes are always once.
- **Revoke:** `sheath revoke --all` writes a watched epoch. A running `sheath mcp` drops live grants.
- **Audit:** JSONL without secrets.

## Try it (no Cursor)

```powershell
git clone https://github.com/brevitywithorion/tokensheath.git
cd tokensheath
npm install
node bin/sheath.mjs onboard
```

Use a throwaway or dummy key. Example origin: `https://jsonplaceholder.typicode.com`.

```powershell
node bin/sheath.mjs call GET /todos/1
node bin/sheath.mjs log
node bin/sheath.mjs revoke --all
```

An approval tab opens on this machine. Allow once. The printed JSON must not contain the key.

## Cursor / Claude Code later

```json
{
  "mcpServers": {
    "tokensheath": {
      "command": "node",
      "args": ["C:\\Users\\YOU\\tokensheath\\bin\\sheath.mjs", "mcp"]
    }
  }
}
```

On macOS/Linux, `./bin/sheath mcp` is the same process.

Store: `~/.tokensheath` or `%USERPROFILE%\.tokensheath` (`SHEATH_HOME` overrides).

## Why not .env

`.env` puts the key in the same context as the model. TokenSheath keeps the key out of that context and asks you before using it.

## License / contact

Source is here while the product domain is in motion. Report vulnerabilities via GitHub Security Advisories on this repo. Do not file a public issue with a working exploit.
