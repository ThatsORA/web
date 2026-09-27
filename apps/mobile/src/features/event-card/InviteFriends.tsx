// Owner: Andy (#345) — "Invite friends" on an existing hangout: search accepted friends, pick, send.
// Invitees join as direct invites, so the inviter won't see them on the card unless they created the hangout (§9).
// The modal is generic so squads reuse it (#359): callers pass the group's member ids, the send call and its error text.
import { FriendsResponse, InviteToEventRequest, routes, type EventCardPayload, type Friend } from "@web/contract";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api, ApiError } from "../../lib/api";
import { displayName } from "../../lib/displayName";
import { Button, Callout, Chip, Modal, TextField, Txt, useTheme } from "../../ui";
import { inviteSearch } from "./cardState";

const MAX_INVITES = 5;

const inviteError = (e: unknown) =>
  e instanceof ApiError && e.status === 409 ? "This hangout isn’t taking invites anymore." :
  e instanceof ApiError && e.status === 400 ? "You can only invite people you’re friends with." :
  "Couldn’t send the invite. Try again.";

/** The modal props that invite friends to this hangout (shared by the voting button and the confirmed card). */
export const eventInvite = (card: EventCardPayload) => ({
  memberIds: card.participants.map((p) => p.id),
  send: (ids: string[]) =>
    api(routes.eventInvite(card.id), z.unknown(), { method: "POST", body: InviteToEventRequest.parse({ invitee_ids: ids }) }),
  errorFor: inviteError,
});

/** Full-width "Invite friends" button, for the open (voting) card. */
export function InviteFriendsButton({ card }: { card: EventCardPayload }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  return (
    <>
      <Button label={sent ?? "Invite friends"} variant="outline" onPress={() => { setSent(null); setOpen(true); }} />
      {open ? <InviteFriendsModal {...eventInvite(card)} onClose={() => setOpen(false)} onSent={(label) => { setSent(label); setOpen(false); }} /> : null}
    </>
  );
}

export function InviteFriendsModal({ memberIds, send: sendInvites, errorFor, onClose, onSent }: {
  memberIds: readonly string[];
  send: (ids: string[]) => Promise<unknown>;
  errorFor: (e: unknown) => string;
  onClose: () => void;
  onSent: (label: string) => void;
}) {
  const t = useTheme();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api(routes.friends, FriendsResponse)
      .then((res) => live && setFriends(res.friends))
      .catch(() => live && setError("Couldn’t load your friends."));
    return () => { live = false; };
  }, []);

  const rows = friends ? inviteSearch(friends, memberIds, query) : [];
  const picked = (friends ?? []).filter((friend) => selected.includes(friend.id));
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < MAX_INVITES ? [...s, id] : s));

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await sendInvites(selected);
      onSent(selected.length === 1 ? "Invite sent" : `${selected.length} invites sent`);
    } catch (e) {
      setError(errorFor(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible onClose={onClose} title="Invite friends">
      <View style={{ gap: t.spacing.sm }}>
        <TextField
          placeholder="Search friends"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {friends && query.trim() && rows.length === 0 ? <Txt variant="small">No friends match that search.</Txt> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
          {/* Picks stay visible after the search changes, so they can be removed. */}
          {picked.map((friend) => (
            <Chip key={friend.id} label={displayName(friend)} selected onPress={() => toggle(friend.id)} />
          ))}
          {rows.filter(({ friend }) => !selected.includes(friend.id)).map(({ friend, inGroup }) => (
            <Chip
              key={friend.id}
              label={inGroup ? `${displayName(friend)} · Already in the group` : displayName(friend)}
              disabled={inGroup}
              onPress={() => toggle(friend.id)}
            />
          ))}
        </View>
        {error ? <Callout tone="danger">{error}</Callout> : null}
        <Button
          label={selected.length > 1 ? `Send ${selected.length} invites` : "Send invite"}
          onPress={() => void send()}
          loading={sending}
          disabled={selected.length === 0}
        />
      </View>
    </Modal>
  );
}
