// Typed fetch layer over the backend API. Base is the relative "/api" prefix.
const BASE = "/api";
export const SESSION_STORAGE_KEY = "shkb_session_user";

// In-memory session state: resets whenever the user enters or reloads the website
// so that every fresh visit prompts for sign-in.
let currentSessionUser: string | null = null;

if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getStoredSessionUser(): string | null {
  return currentSessionUser;
}

export function setStoredSessionUser(username: string | null): void {
  currentSessionUser = username;
}

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const sessionUser = getStoredSessionUser();
  if (sessionUser) {
    headers["X-Session-User"] = sessionUser;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401 && path === "/auth/me") {
      setStoredSessionUser(null);
    }
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json()) as T;

  if ((path === "/auth/login" || path === "/auth/setup") && data && typeof data === "object" && "username" in data) {
    setStoredSessionUser(String((data as { username: string }).username));
  } else if (path === "/auth/logout") {
    setStoredSessionUser(null);
  }

  return data;
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? {});
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? {});
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? {});
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
