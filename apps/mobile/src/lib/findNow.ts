// Owner: Ojas (in Andy's lane by agreement, #196) — the demo's "Find a hangout now" button (#233):
// POST /scheduler/run, then show "Finding a time…" until a new card arrives over the socket or 60 s pass.
import { routes } from "@web/contract";
import { useEffect, useState } from "react";
import { z } from "zod";
import { api } from "./api";

/** How long "Finding a time…" shows after a tap before giving up with a message. */
export const FIND_NOW_TIMEOUT_MS = 60_000;

export type FindNowTap = { at: number; cardIds: string[] };
export type FindNowState = "idle" | "finding" | "timedOut";

/**
 * "finding" from the tap until a card that wasn't on the feed at tap time shows up ("idle"),
 * or until FIND_NOW_TIMEOUT_MS passes ("timedOut"). A tap newer than a stale `now` counts as just tapped.
 */
export function findNowState(tap: FindNowTap | null, now: number, cardIds: string[]): FindNowState {
  if (!tap || cardIds.some((id) => !tap.cardIds.includes(id))) return "idle";
  return now - tap.at < FIND_NOW_TIMEOUT_MS ? "finding" : "timedOut";
}

/** `find()` runs the scheduler; `state` follows the feed's `cardIds`; `error` is set if the POST failed. */
export function useFindNow(cardIds: string[]) {
  const [tap, setTap] = useState<FindNowTap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!tap) return;
    const id = setTimeout(() => setNow(Date.now()), FIND_NOW_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [tap]);

  const find = async () => {
    setError(null);
    setTap({ at: Date.now(), cardIds });
    try {
      await api(routes.runScheduler, z.unknown(), { method: "POST" }); // 202, empty body
    } catch (e) {
      setTap(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return { state: findNowState(tap, now, cardIds), error, find };
}
