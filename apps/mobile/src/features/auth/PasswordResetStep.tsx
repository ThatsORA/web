import { ApiError as ErrorResponse, PasswordResetAccepted, PasswordResetConfirmRequest, PasswordResetRequest, PasswordResetSuccess, WeakPasswordResponse, checkPassword, routes } from "@web/contract";
import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Button, Callout, Screen, TextField, Txt } from "../../ui";

export function PasswordResetStep({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The server also checks the account's username, which this unauthenticated screen doesn't know.
  const check = checkPassword(password, { username: "", email });

  async function request() {
    const parsed = PasswordResetRequest.safeParse({ email: email.trim() });
    if (!parsed.success) return setError("Enter a valid email address.");
    setBusy(true);
    setError(null);
    try {
      await api(routes.passwordResetRequest, PasswordResetAccepted, { method: "POST", body: parsed.data });
      setEmail(parsed.data.email);
      setSent(true);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!check.ok) return setError(check.reason);
    const parsed = PasswordResetConfirmRequest.safeParse({ email, code, new_password: password });
    if (!parsed.success) return setError("Enter the 6-digit code from your email.");
    setBusy(true);
    setError(null);
    try {
      await api(routes.passwordResetConfirm, PasswordResetSuccess, { method: "POST", body: parsed.data });
      setPassword("");
      setCode("");
      setDone(true);
    } catch (e) {
      const weak = WeakPasswordResponse.safeParse(e instanceof ApiError ? e.body : null);
      const response = ErrorResponse.safeParse(e instanceof ApiError ? e.body : null);
      setError(weak.success ? weak.data.reason : response.success && response.data.error === "invalid_reset_code"
        ? "That code is invalid, expired, or already used. Request a new code."
        : "Couldn't reset your password. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <Screen
      title={done ? "Password reset" : sent ? "Check your email" : "Reset your password"}
      subtitle={done ? "Log in with your new password." : sent ? "If that account exists, a code is on its way. Codes expire in 10 minutes; wait a minute before requesting another." : "Enter the email address for your account."}
      footer={
        <>
          {!done ? <Button label={sent ? "Reset password" : "Send code"} onPress={sent ? confirm : request} loading={busy} /> : null}
          {sent && !done ? <Button label="Send a new code" variant="ghost" onPress={request} disabled={busy} /> : null}
          <Button label="Back to login" variant="ghost" onPress={onBack} disabled={busy} />
        </>
      }
    >
      {!sent && !done ? <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" onSubmitEditing={request} /> : null}
      {sent && !done ? (
        <>
          <Txt variant="small" color="textMuted">{email}</Txt>
          <TextField label="Code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" />
          <TextField label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={confirm} />
          <Txt variant="small" color="textMuted">{check.ok ? "Password meets the shared checks." : check.reason}</Txt>
        </>
      ) : null}
      {error ? <Callout tone="danger" title="Couldn't reset password">{error}</Callout> : null}
    </Screen>
  );
}
