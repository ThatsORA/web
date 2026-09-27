// Owner: Andy (#359) — the squad card's invite: same icon button + search modal as the hangout card (#345).
import { InviteToSquadRequest, routes } from "@web/contract";
import { useState } from "react";
import { z } from "zod";
import { api, ApiError } from "../../lib/api";
import { IconButton } from "../../ui";
import { InviteFriendsModal } from "../event-card/InviteFriends";
import { squadErrorMessage, type SquadT } from "./squads";

const errorCode = (e: unknown) => (e instanceof ApiError ? (e.body as { error?: unknown } | null)?.error : undefined);

export function SquadInviteButton({ squad, onInvited }: { squad: SquadT; onInvited: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon={{ ios: "person.badge.plus", android: "person_add", web: "person_add" }}
        label="Invite friends"
        onPress={() => setOpen(true)}
      />
      {open ? (
        <InviteFriendsModal
          memberIds={squad.members.map((m) => m.id)}
          send={(ids) =>
            api(routes.squadInvite(squad.id), z.unknown(), { method: "POST", body: InviteToSquadRequest.parse({ invitee_ids: ids }) })}
          errorFor={(e) => squadErrorMessage(errorCode(e))}
          onClose={() => setOpen(false)}
          onSent={() => { setOpen(false); onInvited(); }}
        />
      ) : null}
    </>
  );
}
