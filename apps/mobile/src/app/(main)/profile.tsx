// Owner: Andy — My profile (#97 part 1): display name, bio, username and email.
// Opened from the You tab and Settings, never a bottom tab. Avatar is initials only:
// the backend has no avatar upload yet.
import { ConfirmEmailChangeRequest, Me, PatchMeRequest, routes } from "@web/contract";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import { z } from "zod";
import { api } from "../../lib/api";
import {
  BIO_MAX,
  USERNAME_RULE,
  buildChangeEmailRequest,
  buildProfilePatch,
  profileErrorMessage,
  usernameProblem,
} from "../../lib/profile";
import { Avatar, Button, Callout, Card, Screen, TextField, Txt, useTheme } from "../../ui";

type MeData = z.infer<typeof Me>;
type Section = { me: MeData; onSaved: (me: MeData) => void };

export default function Profile() {
  const t = useTheme();
  const [me, setMe] = useState<MeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [formVersion, setFormVersion] = useState(0);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setMe(await api(routes.me, Me));
      return true;
    } catch (e) {
      setLoadError(profileErrorMessage(e));
      return false;
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      if (await load()) setFormVersion((version) => version + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)/you");
    }
  };

  return (
    <Screen
      title="My profile"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={t.colors.primary}
          colors={[t.colors.primary]}
          progressBackgroundColor={t.colors.surface}
        />
      }
      headerRight={<Button label="← Back" variant="ghost" onPress={handleBack} />}
    >
      {loadError ? (
        <>
          <Callout tone="danger" title="Couldn't load your profile">
            {loadError}
          </Callout>
          <Button label="Try again" variant="secondary" onPress={() => void load()} />
        </>
      ) : null}
      {me ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.md }}>
            <Avatar name={me.display_name ?? me.username} size="lg" />
            <View style={{ flex: 1, gap: t.spacing.xs }}>
              <Txt variant="section">{me.display_name ?? me.username}</Txt>
              <Txt variant="small">@{me.username}</Txt>
            </View>
          </View>
          <NameAndBio key={`name-${formVersion}`} me={me} onSaved={setMe} />
          <UsernameForm key={`username-${formVersion}`} me={me} onSaved={setMe} />
          <EmailForm key={`email-${formVersion}`} me={me} onSaved={setMe} />
        </>
      ) : null}
    </Screen>
  );
}

function NameAndBio({ me, onSaved }: Section) {
  const [displayName, setDisplayName] = useState(me.display_name ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { patch, errors } = buildProfilePatch(me, { displayName, bio });

  async function save() {
    if (!patch) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api(routes.me, Me, { method: "PATCH", body: PatchMeRequest.parse(patch) });
      setSaved(true);
      onSaved(next);
    } catch (e) {
      setError(profileErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Txt variant="section">Name and bio</Txt>
      <TextField
        label="Display name"
        value={displayName}
        onChangeText={(v) => {
          setDisplayName(v);
          setSaved(false);
        }}
        placeholder={me.username}
        autoCapitalize="words"
        error={errors.displayName}
      />
      <Txt variant="small">Friends see this instead of @{me.username}. Leave it blank to use your username.</Txt>
      <TextField
        label="Bio"
        value={bio}
        onChangeText={(v) => {
          setBio(v);
          setSaved(false);
        }}
        placeholder="A line about you"
        autoCapitalize="sentences"
        multiline
        error={errors.bio}
      />
      <Txt variant="small" numeric>
        {bio.trim().length} / {BIO_MAX}
      </Txt>
      {error ? (
        <Callout tone="danger" title="Couldn't save">
          {error}
        </Callout>
      ) : null}
      {saved ? <Callout tone="success">Saved.</Callout> : null}
      <Button label="Save" onPress={() => void save()} loading={saving} disabled={!patch} />
    </Card>
  );
}

function UsernameForm({ me, onSaved }: Section) {
  const [username, setUsername] = useState(me.username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft = username.trim();
  const problem = draft === me.username ? null : usernameProblem(draft);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api(routes.me, Me, { method: "PATCH", body: PatchMeRequest.parse({ username: draft }) }));
      setSaved(true);
    } catch (e) {
      setError(profileErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Txt variant="section">Username</Txt>
      <TextField
        label="Username"
        value={username}
        onChangeText={(v) => {
          setUsername(v);
          setError(null);
          setSaved(false);
        }}
        autoCorrect={false}
        error={problem}
      />
      <Txt variant="small">{USERNAME_RULE}</Txt>
      {error ? (
        <Callout tone="danger" title="Couldn't change your username">
          {error}
        </Callout>
      ) : null}
      {saved ? <Callout tone="success">{`You’re now @${me.username}.`}</Callout> : null}
      <Button
        label="Change username"
        variant="outline"
        onPress={() => void save()}
        loading={saving}
        disabled={draft === me.username || !!problem}
      />
    </Card>
  );
}

// Email change: password + new address → a code goes to the new address → confirm it.
function EmailForm({ me, onSaved }: Section) {
  const [phase, setPhase] = useState<"idle" | "form" | "code">("idle");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const request = buildChangeEmailRequest(newEmail, password);

  function cancel() {
    setPhase("idle");
    setNewEmail("");
    setPassword("");
    setCode("");
    setError(null);
    setNotice(null);
  }

  async function sendCode() {
    if (!request) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(routes.meEmail, z.unknown(), { method: "POST", body: request }); // 204
      if (phase === "code") setNotice("Sent. Check your inbox for a new code.");
      setPhase("code");
      setCode("");
    } catch (e) {
      setError(profileErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api(routes.meEmailConfirm, Me, { method: "POST", body: ConfirmEmailChangeRequest.parse({ code }) });
      onSaved(next);
      cancel();
      setNotice(`Your email is now ${next.email}.`);
    } catch (e) {
      setError(profileErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const errorBox = error ? (
    <Callout tone="danger" title="Couldn't change your email">
      {error}
    </Callout>
  ) : null;

  return (
    <Card>
      <Txt variant="section">Email</Txt>
      {phase === "idle" ? (
        <>
          <TextField label="Email" value={me.email} editable={false} />
          {notice ? <Callout tone="success">{notice}</Callout> : null}
          <Button
            label="Change email"
            variant="outline"
            onPress={() => {
              setNotice(null);
              setPhase("form");
            }}
          />
        </>
      ) : phase === "form" ? (
        <>
          <Txt variant="small">Now: {me.email}</Txt>
          <TextField
            label="New email"
            value={newEmail}
            onChangeText={setNewEmail}
            keyboardType="email-address"
            autoComplete="email"
            autoCorrect={false}
          />
          <TextField
            label="Current password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
          />
          {errorBox}
          <Button label="Send code" onPress={() => void sendCode()} loading={busy} disabled={!request} />
          <Button label="Cancel" variant="ghost" onPress={cancel} />
        </>
      ) : (
        <>
          <Txt variant="label" color="heading">
            Check your new email
          </Txt>
          <Txt variant="small">
            We sent a 6-digit code to {request?.new_email}. It expires in 10 minutes. Your email changes once you enter
            it.
          </Txt>
          <TextField
            label="Code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            onSubmitEditing={() => void confirm()}
          />
          {notice ? <Callout tone="success">{notice}</Callout> : null}
          {errorBox}
          <Button label="Confirm" onPress={() => void confirm()} loading={busy} disabled={code.length !== 6} />
          <Button label="Send a new code" variant="ghost" onPress={() => void sendCode()} disabled={busy} />
          <Button label="Cancel" variant="ghost" onPress={cancel} />
        </>
      )}
    </Card>
  );
}
