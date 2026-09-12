export type MockNotif = {
  id: string;
  unread: boolean;
  reason: string;
  subject: { title: string; type: string; url: string };
  repository: { full_name: string };
  updated_at: string;
};

export type MockIssue = {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  repository_url: string;
  comments: { id: number; body: string; user: string }[];
};

export type MockGithubState = {
  token: string;
  login: string;
  force401: boolean;
  notifications: MockNotif[];
  issues: MockIssue[];
};

export function demoGithubToken(): string {
  return "gho_" + "m".repeat(36);
}

export function createMockGithubState(token = demoGithubToken()): MockGithubState {
  return {
    token,
    login: "demo-user",
    force401: false,
    notifications: [
      {
        id: "1",
        unread: true,
        reason: "mention",
        subject: {
          title: "Review the broker consent timeout",
          type: "Issue",
          url: "https://api.github.com/repos/acme/tokensheath/issues/12",
        },
        repository: { full_name: "acme/tokensheath" },
        updated_at: "2026-09-12T18:01:00Z",
      },
      {
        id: "2",
        unread: true,
        reason: "assign",
        subject: {
          title: "Redact secrets on tool results",
          type: "PullRequest",
          url: "https://api.github.com/repos/acme/tokensheath/pulls/4",
        },
        repository: { full_name: "acme/tokensheath" },
        updated_at: "2026-09-12T16:40:00Z",
      },
      {
        id: "3",
        unread: false,
        reason: "subscribed",
        subject: {
          title: "MCP stdio handshake notes",
          type: "Issue",
          url: "https://api.github.com/repos/acme/tokensheath/issues/2",
        },
        repository: { full_name: "acme/tokensheath" },
        updated_at: "2026-09-10T09:12:00Z",
      },
    ],
    issues: [
      {
        id: 12,
        number: 12,
        title: "Review the broker consent timeout",
        state: "open",
        html_url: "https://github.com/acme/tokensheath/issues/12",
        repository_url: "https://api.github.com/repos/acme/tokensheath",
        comments: [],
      },
      {
        id: 4,
        number: 4,
        title: "Redact secrets on tool results",
        state: "open",
        html_url: "https://github.com/acme/tokensheath/pull/4",
        repository_url: "https://api.github.com/repos/acme/tokensheath",
        comments: [],
      },
    ],
  };
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createMockGithubFetch(state: MockGithubState): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (state.force401) {
      return jsonRes(401, { message: "Bad credentials" });
    }
    const auth = new Headers(init?.headers).get("Authorization") ?? "";
    if (auth !== `Bearer ${state.token}`) {
      return jsonRes(401, { message: "Bad credentials" });
    }
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.pathname === "/user" && method === "GET") {
      return jsonRes(200, { login: state.login, id: 1, type: "User" });
    }
    if (url.pathname === "/notifications" && method === "GET") {
      const per = Number(url.searchParams.get("per_page") ?? 50);
      return jsonRes(200, state.notifications.slice(0, per));
    }
    if (url.pathname === "/search/issues" && method === "GET") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const per = Number(url.searchParams.get("per_page") ?? 20);
      const items = state.issues
        .filter((i) => !q || i.title.toLowerCase().includes(q) || q.includes("open"))
        .slice(0, per)
        .map((i) => ({
          id: i.id,
          number: i.number,
          title: i.title,
          state: i.state,
          html_url: i.html_url,
          repository_url: i.repository_url,
        }));
      return jsonRes(200, { total_count: items.length, items });
    }
    const comment = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/);
    if (comment && method === "POST") {
      const bodyRaw = init?.body ? String(init.body) : "{}";
      let body = "";
      try {
        body = String((JSON.parse(bodyRaw) as { body?: string }).body ?? "");
      } catch {
        body = "";
      }
      const issue = state.issues.find(
        (i) => i.number === Number(comment[3]) && i.repository_url.endsWith(`${comment[1]}/${comment[2]}`),
      );
      const entry = { id: Date.now(), body, user: state.login };
      if (issue) issue.comments.push(entry);
      return jsonRes(201, {
        id: entry.id,
        body: entry.body,
        html_url: `https://github.com/${comment[1]}/${comment[2]}/issues/${comment[3]}#comment-${entry.id}`,
        user: { login: state.login },
      });
    }
    return jsonRes(404, { message: "Not Found" });
  };
}
