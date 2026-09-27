// Owner: Andy — the event feed: loads my events, keeps them live over the socket, and wires the card's buttons.
import { EventCardPayload, EventsListResponse, routes, VoteRequest } from "@web/contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api, ApiError } from "../../lib/api";
import { runCardAction } from "./cardAction";
import { byStart, detectSwap } from "./cardState";
import { changeSpotNotice, requestChangeSpot } from "./changeSpot";
import type { CardActions } from "./EventCard";
import { useEventSocket } from "./useEventSocket";

// The contract defines no response bodies for vote / ghost-pass; we refetch instead.
const Ignored = z.unknown();

export function useEvents() {
  const [cards, setCards] = useState<Record<string, EventCardPayload>>({});
  const cardsRef = useRef(cards);
  const [swapped, setSwapped] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<Record<string, string | undefined>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (id: string) => {
    let next: EventCardPayload;
    try {
      next = await api(routes.event(id), EventCardPayload);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      const updated = { ...cardsRef.current };
      delete updated[id];
      cardsRef.current = updated;
      setCards(updated);
      return;
    }
    if (detectSwap(cardsRef.current[id], next)) setSwapped((s) => ({ ...s, [id]: true }));
    cardsRef.current = { ...cardsRef.current, [id]: next };
    setCards(cardsRef.current);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const { events } = await api(routes.events, EventsListResponse);
      const nextCards: Record<string, EventCardPayload> = {};
      const newSwapped: Record<string, boolean> = {};
      for (const card of events) {
        if (detectSwap(cardsRef.current[card.id], card)) {
          newSwapped[card.id] = true;
        }
        nextCards[card.id] = card;
      }
      if (Object.keys(newSwapped).length > 0) {
        setSwapped((s) => ({ ...s, ...newSwapped }));
      }
      cardsRef.current = nextCards;
      setCards(nextCards);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  // `refreshing` tracks user-initiated reloads only (pull-to-refresh, "Try again"). The first load and
  // socket reconnects call loadAll directly, so live updates never show the pull spinner (#138).
  const [refreshing, setRefreshing] = useState(false);
  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  useEffect(() => {
    void Promise.resolve().then(loadAll);
  }, [loadAll]);

  useEventSocket((id) => void refetch(id).catch(() => {}), () => void loadAll());

  const run = useCallback(
    async (id: string, call: () => Promise<unknown>, noticeFor?: (e: unknown) => string) => {
      setBusy((b) => ({ ...b, [id]: true }));
      setNotice((n) => ({ ...n, [id]: undefined }));
      const msg = await runCardAction(call, () => refetch(id), noticeFor);
      setNotice((n) => ({ ...n, [id]: msg }));
      setBusy((b) => ({ ...b, [id]: false }));
    },
    [refetch],
  );

  const actionsFor = useCallback(
    (card: EventCardPayload): CardActions => ({
      vote: (optionId) =>
        run(card.id, () =>
          api(routes.vote(card.id), Ignored, { method: "POST", body: VoteRequest.parse({ option_id: optionId }) }),
        ),
      ghostPass: () => run(card.id, () => api(routes.ghostPass(card.id), Ignored, { method: "POST" })),
      changeSpot: () => run(card.id, () => requestChangeSpot(card), changeSpotNotice),
      joinInvite: () => run(card.id, () => api(routes.joinInvite(card.id), Ignored, { method: "POST" })),
      declineInvite: () => run(card.id, () => api(routes.declineInvite(card.id), Ignored, { method: "POST" })),
    }),
    [run],
  );

  return {
    cards: Object.values(cards).sort(byStart),
    swapped,
    busy,
    notice,
    loaded,
    error,
    refreshing,
    reload,
    actionsFor,
  };
}
