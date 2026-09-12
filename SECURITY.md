# Security

TokenSheath keeps credentials out of **model context**. It is not an OS sandbox. A same-user agent with a shell can read `~/.tokensheath`.

Local ping is loopback-only. Host must be exactly `127.0.0.1` or `localhost`. Browser cross-origin POSTs are refused. Session reads are bound to an origin **and path prefix**. Private/link-local origins and HTTP are off unless the user opts into local/dev. Overwriting a saved nickname requires confirm. Redaction is defense in depth, not the boundary.

Please report vulnerabilities privately via **GitHub Security Advisories** on this repository.

Do not open a public issue that includes a working exploit, live keys, or personal data.
