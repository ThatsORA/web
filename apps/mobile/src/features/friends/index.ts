import type { ComponentType } from "react";

// Owner: Ojas — friend search/add, requests inbox, and close-friend star toggle
export { FriendSearch, type FriendSearchProps } from "./FriendSearch";
export { FriendsScreen } from "./FriendsScreen";
export { FriendsStep } from "./FriendsStep";
export { PersonLink } from "./PersonLink";
export { RequestsInbox, type RequestsInboxProps } from "./RequestsInbox";
export {
  acceptFriendRequest,
  deleteFriendRequest,
  getFriendRequests,
  getFriends,
  searchUsers,
  sendFriendRequest,
  starCloseFriend,
  unfriend,
  unstarCloseFriend,
  type Friend,
  type FriendRequest,
  type FriendRequestsResponse,
  type SendFriendRequestResponse,
  type UserSearchResult,
} from "./friendsApi";

/** Mount point for Ojas's close friends settings. Undefined if not yet provided. */
export const CloseFriendsSettings: ComponentType | undefined = undefined;
