export function demoStaticKey(): string {
  return "sk_test_" + "d".repeat(24);
}

export function createMockStaticFetch(expectedKey: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const auth = new Headers(init?.headers).get("Authorization") ?? "";
    if (auth !== `Bearer ${expectedKey}`) {
      return new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 });
    }
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.pathname.endsWith("/v1/balance") && method === "GET") {
      return new Response(
        JSON.stringify({
          object: "balance",
          available: [{ amount: 12450, currency: "usd" }],
          livemode: false,
        }),
        { status: 200 },
      );
    }
    if (url.pathname.endsWith("/v1/charges") && method === "POST") {
      return new Response(
        JSON.stringify({
          id: "ch_demo_1",
          object: "charge",
          amount: 2000,
          currency: "usd",
          status: "succeeded",
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ object: "list", data: [] }), { status: 200 });
  };
}
