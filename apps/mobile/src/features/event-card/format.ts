// Owner: Andy — display strings for the event card. Pure, no React Native.
// Times are shown in the event's IANA timezone, never the device's (invariants: Time).
import type { EventCardPayload, EventOption, VibeTag } from "@web/contract";

const VIBE_LABEL: Record<VibeTag, string> = {
  quick_coffee: "Coffee",
  casual_hangout: "Hangout",
  dinner: "Dinner",
  night_out: "Night out",
};

export const vibeLabel = (vibe: VibeTag) => VIBE_LABEL[vibe];

function localParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const minute = get("minute");
  return {
    day: get("weekday"),
    time: minute === "00" ? get("hour") : `${get("hour")}:${minute}`,
    period: get("dayPeriod").toLowerCase(),
  };
}

/** "Thu · 6:30–8:30pm", the card's headline (the vibe is its eyebrow). */
export function timeLabel(card: Pick<EventCardPayload, "starts_at" | "ends_at" | "timezone">): string {
  const s = localParts(card.starts_at, card.timezone);
  const e = localParts(card.ends_at, card.timezone);
  const range = s.period === e.period ? `${s.time}–${e.time}${e.period}` : `${s.time}${s.period}–${e.time}${e.period}`;
  return `${s.day} · ${range}`;
}

/** "Thu · 6:30–8:30pm · Dinner" */
export const slotLabel = (card: Pick<EventCardPayload, "starts_at" | "ends_at" | "timezone" | "vibe_tag">) =>
  `${timeLabel(card)} · ${vibeLabel(card.vibe_tag)}`;

/** "2 of 3 responded". A ghost pass counts as responded (invariants: Privacy). */
export const progressLabel = ({ responded, total }: NonNullable<EventCardPayload["progress"]>) =>
  `${responded} of ${total} responded`;

/** "Swapped to Sergio's · max 11 min" */
export const swapLabel = (venue: Pick<EventOption, "name" | "max_travel_min">) =>
  `Swapped to ${venue.name} · max ${Math.round(venue.max_travel_min)} min`;

/** Opens the venue in the phone's maps app (Google Maps URLs work on iOS and Android). */
export const mapsUrl = (venue: Pick<EventOption, "lat" | "lng" | "place_id">) =>
  `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}&query_place_id=${encodeURIComponent(venue.place_id)}`;

/** Prefilled share-sheet text for a `chatted` event ("Plan it yourselves"). */
export function shareMessage(card: EventCardPayload, free: { username: string; display_name?: string }[]): string {
  const names = free.map((p) => p.display_name ?? p.username).join(", ");
  return `Web found a time we're all free: ${slotLabel(card)}. Free: ${names}. Where should we go?`;
}
