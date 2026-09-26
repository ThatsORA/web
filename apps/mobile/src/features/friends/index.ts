import type { ComponentType } from "react";

// Owner: Ojas — friend search/add screen + handshake
export { FriendSearch, type FriendSearchProps } from "./FriendSearch";
export { FriendsScreen } from "./FriendsScreen";
export { FriendsStep } from "./FriendsStep";

/** Mount point for Ojas's close friends settings. Undefined if not yet provided. */
export const CloseFriendsSettings: ComponentType | undefined = undefined;

