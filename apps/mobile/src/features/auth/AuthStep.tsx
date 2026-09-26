// Owner: Ojas — sign-up + login (demo step 1). Andy's onboarding container hosts these;
// on success we save the token via session.save() before onDone(), as the container expects.
import { AuthResponse, LoginRequest, SignupRequest, routes } from "@web/contract";
import { getCalendars } from "expo-localization";
import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { stepEyebrow, type OnboardingStepProps } from "../../lib/onboarding";
import { session } from "../../lib/secureSession";
import { Button, Callout, Screen, TextField } from "../../ui";
import { authErrorMessage } from "./errors";

type Mode = "signup" | "login";

// Don't mark fields as credentials, so password managers (iOS Keychain, Android autofill)
// don't pop "Save password?" over demo step 1 (#126).
const noAutofill = { autoComplete: "off", textContentType: "none", importantForAutofill: "no" } as const;

const deviceTimezone = () =>
  getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

function AuthStep({ onDone, initialMode }: OnboardingStepProps & { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signup = mode === "signup";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = signup
        ? SignupRequest.safeParse({ email: email.trim(), username: username.trim(), password, timezone: deviceTimezone() })
        : LoginRequest.safeParse({ email: email.trim(), password });
      if (!body.success) return setError(authErrorMessage(400, mode));
      const res = await api(signup ? routes.signup : routes.login, AuthResponse, { method: "POST", body: body.data });
      await session.save(res.token);
      onDone();
    } catch (e) {
      setError(authErrorMessage(e instanceof ApiError ? e.status : null, mode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      eyebrow={signup ? stepEyebrow("signup") : undefined}
      title={signup ? "Create your account" : "Welcome back"}
      subtitle={signup ? "Your timezone comes from this phone." : "Log in with your email."}
      footer={
        <>
          <Button label={signup ? "Create account" : "Log in"} onPress={submit} loading={busy} />
          <Button
            label={signup ? "I already have an account" : "Create an account instead"}
            variant="ghost"
            onPress={() => {
              setError(null);
              setMode(signup ? "login" : "signup");
            }}
          />
        </>
      }
    >
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" {...noAutofill} />
      {signup ? <TextField label="Username" value={username} onChangeText={(v) => setUsername(v.toLowerCase())} {...noAutofill} /> : null}
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        {...noAutofill}
        onSubmitEditing={submit}
      />
      {error ? (
        <Callout tone="danger" title={signup ? "Couldn't create account" : "Couldn't log in"}>
          {error}
        </Callout>
      ) : null}
    </Screen>
  );
}

export const SignupStep = (props: OnboardingStepProps) => <AuthStep {...props} initialMode="signup" />;
export const LoginStep = (props: OnboardingStepProps) => <AuthStep {...props} initialMode="login" />;
