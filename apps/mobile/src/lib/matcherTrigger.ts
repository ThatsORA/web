// Owner: Andy — remembers (in memory) when this phone last did something that runs the
// matcher, so the Hangouts feed can show "Finding a time…" briefly instead of forever (#99).
import { useEffect, useState, useSyncExternalStore } from "react";

/** How long the feed shows "Finding a time…" after a trigger before falling back to the empty state. */
export const FINDING_WINDOW_MS = 45_000;

export type FeedEmptyState = "cards" | "finding" | "empty";

/**
 * What the feed shows. Cards always win (an incoming `event:created` ends "finding" at once).
 * With no cards: "finding" for FINDING_WINDOW_MS after the last trigger, otherwise "empty".
 * A trigger newer than `now` (a stale clock between renders) counts as just triggered.
 */
export function feedEmptyState(lastTriggerAt: number | null, now: number, cardCount: number): FeedEmptyState {
  if (cardCount > 0) return "cards";
  if (lastTriggerAt === null) return "empty";
  return now - lastTriggerAt < FINDING_WINDOW_MS ? "finding" : "empty";
}

let lastTriggerAt: number | null = null;
const listeners = new Set<() => void>();

/** Call after something on this phone runs the matcher: a close-friend add or a calendar sync. */
export function markMatcherTriggered(at: number = Date.now()): void {
  lastTriggerAt = at;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getLastTriggerAt = () => lastTriggerAt;

/** The feed's state for `cardCount` cards. Re-renders on a new trigger and when the 45 s window ends. */
export function useFeedEmptyState(cardCount: number): FeedEmptyState {
  const triggeredAt = useSyncExternalStore(subscribe, getLastTriggerAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (triggeredAt === null) return;
    const remaining = Math.max(0, triggeredAt + FINDING_WINDOW_MS - Date.now());
    const id = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(id);
  }, [triggeredAt]);

  return feedEmptyState(triggeredAt, now, cardCount);
}
