// Owner: Ojas — user-facing message for a failed sign-up / login. Pure, no React Native.

/** `status` is the ApiError status, or null when the request never got a response. */
export function authErrorMessage(status: number | null, mode: "signup" | "login"): string {
  if (status === 409) return "That email or username is already taken.";
  if (status === 401) return "Wrong email or password.";
  if (status === 400) {
    return mode === "signup"
      ? "Check your details: username is 3–24 lowercase letters, numbers or _, password is 8+ characters."
      : "Enter a valid email and password.";
  }
  return "Couldn't reach the server. Try again.";
}
