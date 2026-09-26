// Owner: Andy — the event feed: loads my events, keeps them live over the socket, and wires the card's buttons.
import {
  EventCardPayload,
  EventsListResponse,
  ReportClosedRequest,
  routes,
  VoteRequest,
} from "@web/contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api, ApiError } from "../../lib/api";
import { byStart, detectSwap } from "./cardState";
import type { CardActions } from "./EventCard";
import { useEventSocket } from "./useEventSocket";

// The contract defines no response bodies for vote / ghost-pass / report-closed; we refetch instead.
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
    const next = await api(routes.event(id), EventCardPayload);
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

  useEffect(() => {
    void Promise.resolve().then(loadAll);
  }, [loadAll]);

  useEventSocket((id) => void refetch(id).catch(() => {}), () => void loadAll());

  const run = useCallback(
    async (id: string, call: () => Promise<unknown>) => {
      setBusy((b) => ({ ...b, [id]: true }));
      setNotice((n) => ({ ...n, [id]: undefined }));
      try {
        await call();
      } catch (e) {
        const msg =
          e instanceof ApiError && e.status === 409
            ? "Someone already reported it. Here's the new spot."
            : e instanceof Error
              ? e.message
              : String(e);
        setNotice((n) => ({ ...n, [id]: msg }));
      } finally {
        await refetch(id).catch(() => {});
        setBusy((b) => ({ ...b, [id]: false }));
      }
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
      reportClosed: () =>
        run(card.id, () =>
          api(routes.reportClosed(card.id), Ignored, {
            method: "POST",
            body: ReportClosedRequest.parse({ current_place_id: card.outcome?.venue?.place_id }),
          }),
        ),
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
    reload: loadAll,
    actionsFor,
  };
}
