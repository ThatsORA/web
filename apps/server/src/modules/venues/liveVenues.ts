// Owner: Riley — live Places and Routes candidate ranking (plan §§6–7).
import type { RankedVenue } from "@web/contract";
import { env } from "../../env";
import { withFixture } from "../../lib/demoMode";
import { getLocalParts, VIBE_TEMPLATES, type ClassifiedSlot } from "../matching/timeMath";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby";
const ROUTES_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const WEEK_MINUTES = 7 * 24 * 60;

export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.primaryType",
  "places.priceLevel",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.regularOpeningHours",
].join(",");

export const ROUTES_FIELD_MASK = "originIndex,destinationIndex,status,condition,duration";

export interface VenueMember {
  id: string;
  timezone: string;
  homeLat: number | null;
  homeLng: number | null;
  favorites: readonly { category: string }[];
  travelMode?: string;
}

interface GoogleTimePoint {
  day?: number;
  hour?: number;
  minute?: number;
}

export interface GoogleOpeningPeriod {
  open?: GoogleTimePoint;
  close?: GoogleTimePoint;
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  priceLevel?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  regularOpeningHours?: {
    periods?: GoogleOpeningPeriod[];
  };
}

interface PlacesResponse {
  places?: GooglePlace[];
}

export interface RouteMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  status?: { code?: number; message?: string };
  condition?: string;
  duration?: string;
}

export interface VenueCandidate {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  primary_type: string | null;
  price_level: number | null;
  rating: number | null;
  user_rating_count: number | null;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function priceLevel(value: string | undefined): number | null {
  switch (value) {
    case "PRICE_LEVEL_FREE":
    case "PRICE_LEVEL_INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return 4;
    default:
      return null;
  }
}

function pointMinute(point: GoogleTimePoint): number | null {
  if (point.day === undefined) return null;
  return point.day * 24 * 60 + (point.hour ?? 0) * 60 + (point.minute ?? 0);
}

export function isOpenForSlot(
  periods: readonly GoogleOpeningPeriod[] | undefined,
  slot: ClassifiedSlot,
  timezone: string,
): boolean {
  if (!periods?.length) return true;
  const start = getLocalParts(slot.start, timezone);
  const slotStart = WEEKDAY_INDEX[start.weekday]! * 24 * 60 + start.hour * 60 + start.minute;
  const slotEnd = slotStart + Math.ceil((slot.end.getTime() - slot.start.getTime()) / 60_000);

  return periods.some((period) => {
    const open = period.open ? pointMinute(period.open) : null;
    if (open === null) return false;
    if (!period.close) return true;
    const rawClose = pointMinute(period.close);
    if (rawClose === null) return false;
    const close = rawClose <= open ? rawClose + WEEK_MINUTES : rawClose;
    return [-WEEK_MINUTES, 0, WEEK_MINUTES].some((shift) =>
      open + shift <= slotStart && close + shift >= slotEnd,
    );
  });
}

function validPlace(place: GooglePlace): place is GooglePlace & {
  id: string;
  displayName: { text: string };
  location: { latitude: number; longitude: number };
} {
  return Boolean(
    place.id &&
    place.displayName?.text &&
    Number.isFinite(place.location?.latitude) &&
    Number.isFinite(place.location?.longitude),
  );
}

export function filterPlaces(
  places: readonly GooglePlace[],
  slot: ClassifiedSlot,
  timezone: string,
  allowedPrice: readonly [number, number],
): GooglePlace[] {
  const base = places.filter((place) => {
    if (!validPlace(place) || place.businessStatus !== "OPERATIONAL") return false;
    if (!isOpenForSlot(place.regularOpeningHours?.periods, slot, timezone)) return false;
    const price = priceLevel(place.priceLevel);
    return price === null || (price >= allowedPrice[0] && price <= allowedPrice[1]);
  });
  const rated = base.filter((place) =>
    (place.rating ?? 0) >= 4 && (place.userRatingCount ?? 0) >= 30,
  );
  return rated.length >= 5 ? rated : base;
}

function toCandidate(place: GooglePlace): VenueCandidate | null {
  if (!validPlace(place)) return null;
  return {
    place_id: place.id,
    name: place.displayName.text,
    lat: place.location.latitude,
    lng: place.location.longitude,
    primary_type: place.primaryType ?? null,
    price_level: priceLevel(place.priceLevel),
    rating: place.rating ?? null,
    user_rating_count: place.userRatingCount ?? null,
  };
}

async function googlePost<T>(url: string, fieldMask: string, body: unknown): Promise<T> {
  if (!env.GOOGLE_MAPS_API_KEY) throw new Error("GOOGLE_MAPS_API_KEY is required for live venue ranking");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Google Maps request failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function nearbySearch(
  slot: ClassifiedSlot,
  latitude: number,
  longitude: number,
  radiusMeters: number,
): Promise<GooglePlace[]> {
  const template = VIBE_TEMPLATES[slot.vibe_tag];
  const key = `${slot.vibe_tag}-${latitude.toFixed(3)}-${longitude.toFixed(3)}-${radiusMeters}`;
  const response = await withFixture<PlacesResponse>("places", key, () => googlePost(
    PLACES_URL,
    PLACES_FIELD_MASK,
    {
      includedTypes: template.placesTypes,
      maxResultCount: 20,
      locationRestriction: {
        circle: { center: { latitude, longitude }, radius: radiusMeters },
      },
    },
  ));
  return response.places ?? [];
}

export function rankRouteMatrix(
  candidates: readonly VenueCandidate[],
  members: readonly Pick<VenueMember, "id">[],
  elements: readonly RouteMatrixElement[],
): RankedVenue[] {
  const minutesByDestination = new Map<number, Map<string, number>>();
  for (const element of elements) {
    if (
      element.originIndex === undefined ||
      element.destinationIndex === undefined ||
      element.condition !== "ROUTE_EXISTS" ||
      (element.status?.code ?? 0) !== 0 ||
      !element.duration?.endsWith("s")
    ) continue;
    const seconds = Number(element.duration.slice(0, -1));
    const member = members[element.originIndex];
    if (!member || !Number.isFinite(seconds)) continue;
    const travel = minutesByDestination.get(element.destinationIndex) ?? new Map<string, number>();
    travel.set(member.id, Math.ceil(seconds / 60));
    minutesByDestination.set(element.destinationIndex, travel);
  }

  return candidates.flatMap((candidate, index) => {
    const travel = minutesByDestination.get(index);
    if (!travel || travel.size !== members.length) return [];
    const travel_minutes = Object.fromEntries(members.map((member) => [member.id, travel.get(member.id)!]));
    const minutes = Object.values(travel_minutes);
    const max_travel_min = Math.max(...minutes);
    return [{
      ...candidate,
      travel_minutes,
      max_travel_min,
      route_score: max_travel_min + 0.1 * minutes.reduce((sum, value) => sum + value, 0),
    }];
  }).sort((a, b) => a.route_score - b.route_score || a.place_id.localeCompare(b.place_id)).slice(0, 5);
}

export async function routeCandidates(
  slot: ClassifiedSlot,
  members: readonly VenueMember[],
  candidates: readonly VenueCandidate[],
): Promise<RankedVenue[]> {
  const departureTime = new Date(slot.start.getTime() - 30 * 60_000).toISOString();
  
  const membersByMode = new Map<string, { member: VenueMember; index: number }[]>();
  members.forEach((member, index) => {
    const mode = member.travelMode || "DRIVE";
    const list = membersByMode.get(mode) || [];
    list.push({ member, index });
    membersByMode.set(mode, list);
  });

  const destinations = candidates.map((candidate) => ({
    waypoint: { location: { latLng: { latitude: candidate.lat, longitude: candidate.lng } } },
  }));

  const allElements: RouteMatrixElement[] = [];

  for (const [mode, modeMembers] of membersByMode.entries()) {
    const key = `${slot.vibe_tag}-${slot.start.toISOString().replaceAll(":", "-")}-${mode}`;
    const payload: any = {
      origins: modeMembers.map(({ member }) => ({
        waypoint: { location: { latLng: { latitude: member.homeLat, longitude: member.homeLng } } },
      })),
      destinations,
      travelMode: mode,
    };
    if (mode === "DRIVE") {
      payload.routingPreference = "TRAFFIC_AWARE";
      payload.departureTime = departureTime;
    }
    const elements = await withFixture<RouteMatrixElement[]>("routes", key, () => googlePost<RouteMatrixElement[]>(
      ROUTES_URL,
      ROUTES_FIELD_MASK,
      payload
    ));

    for (const element of elements) {
      if (element.originIndex !== undefined) {
        allElements.push({
          ...element,
          originIndex: modeMembers[element.originIndex]!.index,
        });
      } else {
        allElements.push(element);
      }
    }
  }

  return rankRouteMatrix(candidates, members, allElements);
}

export async function fetchCandidates(
  slot: ClassifiedSlot,
  members: readonly VenueMember[],
): Promise<RankedVenue[]> {
  if (!members.length || members.some((member) => member.homeLat === null || member.homeLng === null)) return [];
  const latitude = members.reduce((sum, member) => sum + member.homeLat!, 0) / members.length;
  const longitude = members.reduce((sum, member) => sum + member.homeLng!, 0) / members.length;
  const timezone = members[0]!.timezone;
  const template = VIBE_TEMPLATES[slot.vibe_tag];

  let places = filterPlaces(await nearbySearch(slot, latitude, longitude, 4_000), slot, timezone, template.priceRange);
  if (places.length < 5) {
    places = filterPlaces(await nearbySearch(slot, latitude, longitude, 8_000), slot, timezone, template.priceRange);
  }

  const favorites = new Set(members.flatMap((member) => member.favorites.map((favorite) => favorite.category)));
  const candidates = places
    .map(toCandidate)
    .filter((place): place is VenueCandidate => place !== null)
    .sort((a, b) =>
      ((b.rating ?? 0) + (b.primary_type && favorites.has(b.primary_type) ? 0.3 : 0)) -
      ((a.rating ?? 0) + (a.primary_type && favorites.has(a.primary_type) ? 0.3 : 0)) ||
      (b.user_rating_count ?? 0) - (a.user_rating_count ?? 0) ||
      a.place_id.localeCompare(b.place_id),
    )
    .slice(0, 10);
  if (!candidates.length) return [];
  return routeCandidates(slot, members, candidates);
}
