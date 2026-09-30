import { queryClient } from "./queryClient";
import { apiPost, setStoredSessionUser } from "./api";

// Call after every successful login/signup.
export function beginSession(): void {
  queryClient.clear();
}

// Call from every sign-out control; the hard redirect resets all in-memory state.
export async function endSession(redirectTo: string = "/login"): Promise<void> {
  try {
    await apiPost("/auth/logout");
  } finally {
    setStoredSessionUser(null);
    queryClient.clear();
    window.location.assign(redirectTo);
  }
}
