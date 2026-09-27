// Owner: Ojas — Shared hook for friends & requests loading + close friend star toggle.
import { useCallback, useEffect, useState } from "react";
import {
  getFriendRequests,
  getFriends,
  starCloseFriend,
  unstarCloseFriend,
  type Friend,
  type FriendRequestsResponse,
} from "./friendsApi";

export function useFriendsData() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequestsResponse>({ incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const [friendsList, reqs] = await Promise.all([getFriends(), getFriendRequests()]);
      setFriends(friendsList);
      setRequests(reqs);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setActionError(null);
    await loadData();
  }, [loadData]);

  const toggleClose = useCallback(async (f: Friend) => {
    setActionError(null);
    const nextClose = !f.close;
    // Optimistic update
    setFriends((prev) => prev.map((item) => (item.id === f.id ? { ...item, close: nextClose } : item)));
    try {
      if (nextClose) {
        await starCloseFriend(f.username);
      } else {
        await unstarCloseFriend(f.id);
      }
    } catch (e) {
      // Revert on error
      setFriends((prev) => prev.map((item) => (item.id === f.id ? { ...item, close: f.close } : item)));
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return {
    friends,
    setFriends,
    requests,
    setRequests,
    loading,
    refreshing,
    loadError,
    actionError,
    setActionError,
    loadData,
    refresh,
    toggleClose,
  };
}
