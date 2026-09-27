// Owner: Riley (edited by agreement, #196/#322) — nearby activity discovery for the automated scheduler.
// No fixed activity list: ONE Places Nearby Search (New) over broad leisure types, then code keeps the
// places open ≥ 45 min in the free window, ranks them by worst member commute and times each option.
// Gemini only labels them (intelligence/activities.ts). Manual hangouts keep the fixed vibes.
import type { RankedVenue, SpendCategory } from "@web/contract";
import { withFixture } from "../../lib/demoMode";
import type { ActivityInfo } from "../intelligence/activities";
import { getLocalParts, localToUtc, mergeIntervals, type ClassifiedSlot, type Interval } from "../matching/timeMath";
import {
  googlePost,
  homeCentroid,
  PLACES_URL,
  routeCandidates,
  toCandidate,
  validPlace,
  type GoogleOpeningPeriod,
  type GooglePlace,
  type VenueCandidate,
  type VenueMember,
} from "./liveVenues";

/** Table A types (≤ 50 per request): food, drink, entertainment, sports, outdoors, culture. */
export const LEISURE_TYPES = [
  "restaurant", "cafe", "coffee_shop", "bakery", "dessert_shop", "ice_cream_shop", "tea_house",
  "bar", "pub", "wine_bar", "brewery",
  "bowling_alley", "amusement_center", "amusement_park", "movie_theater", "karaoke", "video_arcade",
  "comedy_club", "live_music_venue", "concert_hall", "night_club", "miniature_golf_course",
  "go_karting_venue", "paintball_center", "adventure_sports_center",
  "ice_skating_rink", "golf_course", "sports_complex", "sports_activity_location", "swimming_pool", "tennis_court",
  "park", "hiking_area", "botanical_garden", "garden", "beach", "observation_deck", "state_park", "zoo", "aquarium",
  "museum", "art_gallery", "performing_arts_theater", "cultural_center", "planetarium", "historical_landmark",
];

// Billed as Nearby Search Enterprise (regularOpeningHours). rating, userRatingCount and priceLevel are the
// same SKU, so they cost nothing extra; the rest are Pro.
export const DISCOVERY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.primaryType",
  "places.businessStatus",
  "places.timeZone",
  "places.regularOpeningHours",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
].join(",");

const QUARTER_MS = 15 * 60_000;
const MIN_OPEN_MIN = 45;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A place's opening hours between `from` and `to` as merged UTC intervals. Periods are read in the
 * place's local time (`timezone`). No hours, or a period without a close (open 24/7), = open throughout.
 */
export function openIntervals(
  periods: readonly GoogleOpeningPeriod[] | undefined,
  timezone: string,
  from: Date,
  to: Date,
): Interval[] {
  if (from >= to) return [];
  if (!periods?.length || periods.some((period) => period.open && !period.close)) return [{ start: from, end: to }];
  const first = getLocalParts(from, timezone);
  const days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  const open: Interval[] = [];
  // Start a day early: a period that opened yesterday can still be open at `from`.
  for (let k = -1; k <= days; k++) {
    const date = getLocalParts(localToUtc(first.year, first.month, first.day + k, 12, 0, timezone), timezone);
    const weekday = WEEKDAYS.indexOf(date.weekday);
    for (const { open: o, close: c } of periods) {
      if (!o || !c || o.day !== weekday) continue;
      const openMin = (o.hour ?? 0) * 60 + (o.minute ?? 0);
      const closeMin = (c.hour ?? 0) * 60 + (c.minute ?? 0);
      let ahead = ((c.day ?? weekday) - weekday + 7) % 7;
      if (ahead === 0 && closeMin <= openMin) ahead = 7;
      const start = localToUtc(date.year, date.month, date.day, o.hour ?? 0, o.minute ?? 0, timezone);
      const end = localToUtc(date.year, date.month, date.day + ahead, c.hour ?? 0, c.minute ?? 0, timezone);
      if (end > from && start < to) {
        open.push({ start: start < from ? from : start, end: end > to ? to : end });
      }
    }
  }
  return mergeIntervals(open);
}

/** The first 15-min mark inside an open interval where `minutes` fits before it ends; null if none. */
export function firstFit(open: readonly Interval[], minutes: number): Interval | null {
  for (const interval of open) {
    const start = Math.ceil(interval.start.getTime() / QUARTER_MS) * QUARTER_MS;
    const end = start + minutes * 60_000;
    if (end <= interval.end.getTime()) return { start: new Date(start), end: new Date(end) };
  }
  return null;
}

export interface DiscoveredPlace extends RankedVenue {
  /** When it's open inside [from, to]. */
  open: Interval[];
}

/**
 * Up to 15 leisure places near the squad's homes that are open ≥ 45 min inside [from, to],
 * best worst-member commute first (the existing route matrix). `slot` only sets the departure time.
 */
export async function discoverPlaces(
  slot: ClassifiedSlot,
  from: Date,
  to: Date,
  members: readonly VenueMember[],
): Promise<DiscoveredPlace[]> {
  const center = homeCentroid(members);
  if (!center) return [];
  const { latitude, longitude } = center;
  // ponytail: one search, ranked by popularity, so 20 results can lean to restaurants;
  // a second search per category if option variety suffers.
  const response = await withFixture<{ places?: GooglePlace[] }>(
    "places",
    `discover-${latitude.toFixed(3)}-${longitude.toFixed(3)}`,
    () => googlePost(PLACES_URL, DISCOVERY_FIELD_MASK, {
      includedTypes: LEISURE_TYPES,
      maxResultCount: 20,
      locationRestriction: { circle: { center: { latitude, longitude }, radius: 5_000 } },
    }),
  );

  const openById = new Map<string, Interval[]>();
  const candidates: VenueCandidate[] = [];
  for (const place of response.places ?? []) {
    if (!validPlace(place) || place.businessStatus !== "OPERATIONAL") continue;
    const open = openIntervals(place.regularOpeningHours?.periods, place.timeZone?.id ?? members[0]!.timezone, from, to);
    if (!firstFit(open, MIN_OPEN_MIN)) continue;
    openById.set(place.id, open);
    candidates.push(toCandidate(place)!);
  }
  if (!candidates.length) return [];
  const ranked = await routeCandidates(slot, members, candidates, 15);
  return ranked.map((venue) => ({ ...venue, open: openById.get(venue.place_id)! }));
}

export type ActivityCandidate = RankedVenue & { activity: string; spend_category: SpendCategory; starts_at: string; ends_at: string };

/**
 * Each place as an activity at its own time: the first open 15-min mark that fits its typical length.
 * Places where it doesn't fit are dropped; the input (commute) order is kept.
 */
export function timeCandidates(
  places: readonly DiscoveredPlace[],
  activities: ReadonlyMap<string, ActivityInfo>,
): ActivityCandidate[] {
  return places.flatMap(({ open, ...venue }) => {
    const { activity, typical_minutes, spend_category } = activities.get(venue.place_id)!;
    const time = firstFit(open, typical_minutes);
    return time ? [{ ...venue, activity, spend_category, starts_at: time.start.toISOString(), ends_at: time.end.toISOString() }] : [];
  });
}
