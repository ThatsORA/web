// Owner: Ojas — API helpers for searching, adding, listing, and removing close friends.
// Invariant: privacy — friend endpoints never reveal whether someone added you.
import {
  AddCloseFriendRequest,
  CloseFriendsResponse,
  routes,
  UserSearchResponse,
  type CloseFriend,
  type UserSearchResult,
} from "@web/contract";
import { z } from "zod";
import { api } from "../../lib/api";

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const res = await api(`${routes.userSearch}?q=${encodeURIComponent(trimmed)}`, UserSearchResponse);
  return res.users;
}

export async function getCloseFriends(): Promise<CloseFriend[]> {
  const res = await api(routes.closeFriends, CloseFriendsResponse);
  return res.friends;
}

export async function addCloseFriend(username: string): Promise<void> {
  const body = AddCloseFriendRequest.parse({ username });
  await api(routes.closeFriends, z.unknown(), { method: "POST", body });
}

export async function removeCloseFriend(userId: string): Promise<void> {
  await api(routes.closeFriend(userId), z.unknown(), { method: "DELETE" });
}
