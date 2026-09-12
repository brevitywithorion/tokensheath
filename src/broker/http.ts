export function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

export const REDIRECT_DENIED = "Redirects are not allowed. The credential was not forwarded.";

export function fetchInit(init: RequestInit = {}): RequestInit {
  return { ...init, redirect: "manual" };
}
