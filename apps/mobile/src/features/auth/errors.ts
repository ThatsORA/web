// Owner: Ojas — user-facing message for a failed sign-up / login. Pure, no React Native.

/** `status` is the ApiError status, or null when the request never got a response. */
export function authErrorMessage(status: number | null, mode: "signup" | "login", error?: unknown): string {
  if (error === "email_unavailable") return "We couldn't send the verification email. Try again in a moment.";
  if (status === 409) return "That email or username is already taken.";
  if (status === 401) return "Wrong email, username or password.";
  if (status === 429) return "Too many login attempts. Wait 15 minutes and try again.";
  if (status === 400) {
    return mode === "signup"
      ? "Check your details: username is 3–24 lowercase letters, numbers or _, password is 6–30 characters and must pass the password check."
      : "Enter your email or username and password.";
  }
  return "Couldn't reach the server. Try again.";
}

/** Message for a failed verify or resend. `error` is the server's `{ error }` code, when there was one. */
export function verifyErrorMessage(status: number | null, error?: unknown): string {
  if (error === "email_unavailable") return "We couldn't send an email right now. Try again in a moment.";
  if (error === "wrong_code") return "That code isn't right. Check the email and try again.";
  if (error === "code_expired") return "That code has expired or been used up. Send a new one.";
  if (status === 429) return "We just sent a code. Wait a minute before asking for another.";
  if (status === 400) return "Enter the 6-digit code from the email.";
  return "Couldn't reach the server. Try again.";
}
