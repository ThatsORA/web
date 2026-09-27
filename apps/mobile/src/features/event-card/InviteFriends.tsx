// Owner: Andy (#345) — "Invite friends" on an existing hangout: pick accepted friends, send, done.
// Invitees join as direct invites, so the inviter won't see them on the card unless they created the hangout (§9).
import { FriendsResponse, InviteToEventRequest, routes, type EventCardPayload, type Friend } from "@web/contract";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api, ApiError } from "../../lib/api";
import { displayName } from "../../lib/displayName";
import { Button, Callout, Chip, Modal, Txt, useTheme } from "../../ui";
import { invitableFriends } from "./cardState";

const MAX_INVITES = 5;

const inviteError = (e: unknown) =>
  e instanceof ApiError && e.status === 409 ? "This hangout isn’t taking invites anymore." :
  e instanceof ApiError && e.status === 400 ? "You can only invite people you’re friends with." :
  "Couldn’t send the invite. Try again.";

export function InviteFriendsButton({ card }: { card: EventCardPayload }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  return (
    <>
      <Button label={sent ?? "Invite friends"} variant="outline" onPress={() => { setSent(null); setOpen(true); }} />
      {open ? <InviteFriendsModal card={card} onClose={() => setOpen(false)} onSent={(label) => { setSent(label); setOpen(false); }} /> : null}
    </>
  );
}

function InviteFriendsModal({ card, onClose, onSent }: { card: EventCardPayload; onClose: () => void; onSent: (label: string) => void }) {
  const t = useTheme();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api(routes.friends, FriendsResponse)
      .then((res) => live && setFriends(invitableFriends(res.friends, card)))
      .catch(() => live && setError("Couldn’t load your friends."));
    return () => { live = false; };
  }, [card]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < MAX_INVITES ? [...s, id] : s));

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await api(routes.eventInvite(card.id), z.unknown(), {
        method: "POST",
        body: InviteToEventRequest.parse({ invitee_ids: selected }),
      });
      onSent(selected.length === 1 ? "Invite sent" : `${selected.length} invites sent`);
    } catch (e) {
      setError(inviteError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible onClose={onClose} title="Invite friends">
      <View style={{ gap: t.spacing.sm }}>
        <Txt variant="small">
          {card.status === "voting"
            ? "They’ll get this hangout and can vote on a spot or pass privately."
            : "They’ll get this hangout and can tap “Can’t make it” if they’re out."}{" "}
          Up to {MAX_INVITES} at a time.
        </Txt>
        {friends === null && !error ? <Txt variant="small">Loading friends…</Txt> : null}
        {friends?.length === 0 ? <Txt variant="small">Everyone you’re friends with is already here.</Txt> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm }}>
          {friends?.map((f) => (
            <Chip key={f.id} label={displayName(f)} selected={selected.includes(f.id)} onPress={() => toggle(f.id)} />
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
