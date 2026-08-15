/**
 * authErrors.ts — Translates raw auth/database errors into clear user-facing messages.
 *
 * TYPESCRIPT CONCEPTS:
 * - `unknown` is a safe alternative to `any`: you must narrow it before use.
 * - Type guards (`typeof`, `in`) narrow `unknown` down to a usable shape.
 */

/** True when the Supabase client was built without its URL/key (env vars missing). */
export const isSupabaseConfigured = (): boolean =>
  Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const messageOf = (error: unknown): string => {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return "";
};

/**
 * Maps an auth error to a specific, actionable message.
 * @param error   the error returned by Supabase (or thrown by fetch)
 * @param context "login" | "register" | "profile" — tunes the wording
 */
export function describeAuthError(
  error: unknown,
  context: "login" | "register" | "profile" = "login"
): string {
  const raw = messageOf(error);
  const msg = raw.toLowerCase();

  if (!isSupabaseConfigured()) {
    return "Authentication service configuration is missing. Please contact the administrator.";
  }

  // Network-level failure: the request never reached the auth server.
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("fetch failed")
  ) {
    return "Unable to reach the authentication server. The backend may be paused or your connection is offline — please check your internet and try again.";
  }

  if (msg.includes("timeout") || msg.includes("timed out")) {
    return "The authentication server took too long to respond. Please try again.";
  }

  if (msg.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (msg.includes("email not confirmed")) {
    return "Email verification is required. Please open the confirmation link we emailed you.";
  }

  if (msg.includes("user already registered") || msg.includes("already been registered")) {
    return "An account already exists with this email. Please log in instead.";
  }

  if (msg.includes("user not found")) {
    return "No account was found for this email address.";
  }

  if (msg.includes("password should be") || msg.includes("weak password")) {
    return "Please choose a stronger password (at least 6 characters).";
  }

  if (msg.includes("email rate limit") || msg.includes("too many requests") || msg.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (context === "profile") {
    if (msg.includes("permission") || msg.includes("row-level security") || msg.includes("policy")) {
      return "Authentication succeeded, but your profile could not be loaded due to access restrictions.";
    }
    return "Authentication succeeded, but your user profile could not be loaded. Please try again.";
  }

  if (context === "register") {
    return raw || "Registration could not be completed. Please try again.";
  }

  return raw || "An unexpected error occurred while signing in. Please try again.";
}
