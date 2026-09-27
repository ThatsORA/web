// Owner: Andy (#359) — the squad card's invite: same icon button + search modal as the hangout card (#345).
// Stub so #360's layout can mount it; #359 wires the modal.
import { IconButton } from "../../ui";
import type { SquadT } from "./squads";

export function SquadInviteButton(_props: { squad: SquadT; onInvited: () => void }) {
  return (
    <IconButton
      icon={{ ios: "person.badge.plus", android: "person_add", web: "person_add" }}
      label="Invite friends"
      onPress={() => {}}
    />
  );
}
