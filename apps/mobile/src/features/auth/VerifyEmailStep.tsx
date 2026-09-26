// Owner: Ojas — "Check your email" (#91): the 6-digit code sent at sign-up. Andy's onboarding
// container mounts it right after sign-up; onDone() runs once the email is verified, or on skip
// (unverified accounts can finish onboarding, they just can't be found until they verify).
import { Me, VerifyEmailRequest, routes } from "@web/contract";
import { useEffect, useState } from "react";
import { z } from "zod";
import { api, ApiError } from "../../lib/api";
import { stepEyebrow, type OnboardingStepProps } from "../../lib/onboarding";
import { Button, Callout, Screen, TextField } from "../../ui";
import { verifyErrorMessage } from "./errors";

const serverError = (e: unknown) => ({
  status: e instanceof ApiError ? e.status : null,
  code: e instanceof ApiError ? (e.body as { error?: unknown } | null)?.error : undefined,
});

export function VerifyEmailStep({ onDone }: OnboardingStepProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  // Already verified, or verification is off (demo config reports every account as verified).
  useEffect(() => {
    let cancelled = false;
    api(routes.me, Me)
      .then((me) => {
        if (!cancelled && me.email_verified) onDone();
      })
      .catch(() => {}); // the code field still works
    return () => {
      cancelled = true;
    };
  }, [onDone]);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      await api(routes.verifyEmail, Me, { method: "POST", body: VerifyEmailRequest.parse({ code }) });
      onDone();
    } catch (e) {
      const { status, code: err } = serverError(e);
      setError(verifyErrorMessage(status, err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setResent(false);
    try {
      await api(routes.verifyEmailSend, z.unknown(), { method: "POST" });
      setResent(true);
    } catch (e) {
      const { status, code: err } = serverError(e);
      if (status === 409) return onDone(); // already verified
      setError(verifyErrorMessage(status, err));
    }
  }

  return (
    <Screen
      eyebrow={stepEyebrow("verify-email")}
      title="Check your email"
      subtitle="We sent you a 6-digit code. It expires in 10 minutes."
      footer={
        <>
          <Button label="Verify" onPress={verify} loading={busy} disabled={code.length !== 6} />
          <Button label="Send a new code" variant="ghost" onPress={resend} />
          <Button label="Skip for now" variant="ghost" onPress={onDone} />
        </>
      }
    >
      <TextField
        label="Code"
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        onSubmitEditing={verify}
      />
      {resent ? <Callout tone="success" title="Sent">Check your inbox for a new code.</Callout> : null}
      {error ? (
        <Callout tone="danger" title="Couldn't verify">
          {error}
        </Callout>
      ) : null}
    </Screen>
  );
}
