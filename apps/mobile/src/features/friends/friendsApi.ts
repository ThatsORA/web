// Owner: Ojas — API helpers for friends, friend requests, and close-friend stars.
// Invariant: privacy — close-friend star status is never revealed to the other user.
import {
  AddCloseFriendRequest,
  CloseFriendsResponse,
  type CloseFriend,
  Friend as FriendSchema,
  FriendRequest as FriendRequestSchema,
  FriendRequestsResponse as FriendRequestsResponseSchema,
  FriendsResponse,
  routes,
  SendFriendRequest,
  SendFriendRequestResponse as SendFriendRequestResponseSchema,
  UserSearchResponse,
  UserSearchResult as UserSearchResultSchema,
} from "@web/contract";
import { z } from "zod";
import { api } from "../../lib/api";

export type UserSearchResult = z.infer<typeof UserSearchResultSchema>;
export type Friend = z.infer<typeof FriendSchema>;
export type FriendRequest = z.infer<typeof FriendRequestSchema>;
export type FriendRequestsResponse = z.infer<typeof FriendRequestsResponseSchema>;
export type SendFriendRequestResponse = z.infer<typeof SendFriendRequestResponseSchema>;

/** Search users by username prefix. Never reveals whether they requested or added you. */
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const res = await api(`${routes.userSearch}?q=${encodeURIComponent(trimmed)}`, UserSearchResponse);
  return res.users;
}

/** Accepted friends list. Each friend has `close` set to MY choice only. */
export async function getFriends(): Promise<Friend[]> {
  const res = await api(routes.friends, FriendsResponse);
  return res.friends;
}

/** Incoming and outgoing friend requests. */
export async function getFriendRequests(): Promise<FriendRequestsResponse> {
  const res = await api(routes.friendRequests, FriendRequestsResponseSchema);
  return res;
}

/**
 * Send a friend request. If the other person already requested me,
 * this automatically accepts and returns { status: "friends" }.
 * Otherwise returns { status: "requested" }.
 */
export async function sendFriendRequest(username: string): Promise<SendFriendRequestResponse> {
  const body = SendFriendRequest.parse({ username });
  return await api(routes.friendRequests, SendFriendRequestResponseSchema, { method: "POST", body });
}

/** Accept an incoming friend request. */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  await api(routes.acceptFriendRequest(requestId), z.unknown(), { method: "POST" });
}

/** Decline (if recipient) or cancel (if requester) a pending friend request. */
export async function deleteFriendRequest(requestId: string): Promise<void> {
  await api(routes.friendRequest(requestId), z.unknown(), { method: "DELETE" });
}

/** Unfriend an accepted friend. Clears both close-friend flags. */
export async function unfriend(userId: string): Promise<void> {
  await api(routes.friend(userId), z.unknown(), { method: "DELETE" });
}

/** Friends I starred. Never reveals whether they starred me back. */
export async function getCloseFriends(): Promise<CloseFriend[]> {
  const res = await api(routes.closeFriends, CloseFriendsResponse);
  return res.friends;
}

/**
 * Star an accepted friend as a close friend.
 * Returns 409 if not accepted friends.
 * Silent: the other user never learns if they are starred.
 */
export async function starCloseFriend(username: string): Promise<void> {
  const body = AddCloseFriendRequest.parse({ username });
  await api(routes.closeFriends, z.unknown(), { method: "POST", body });
}

/** Unstar a close friend. */
export async function unstarCloseFriend(userId: string): Promise<void> {
  await api(routes.closeFriend(userId), z.unknown(), { method: "DELETE" });
}
