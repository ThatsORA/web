// Owner: Riley — the matcher pipeline (plan §2–§7), behind ONE in-process mutex.
// Every trigger (cron, handshake, busy-block PUT, /internal/run-matcher)
// calls triggerMatcher(); never call the pipeline around it.
import type { CurateContext, EventOption, RankedVenue } from "@web/contract";
import { env } from "../../env";
import { prisma } from "../../lib/prisma";
import { curateVenues, factsLine } from "../intelligence/curateVenues";
import { openVoting } from "../voting/lifecycle";
import { candidateGroups, selectCandidates, type GroupSlot } from "./candidates";
import { classifySlot, formatTimeHHMM, freeWindows, getLocalParts } from "./timeMath";

export { freeWindows, classifySlot } from "./timeMath";

let running: Promise<void> | null = null;
let rerunRequested = false;

const STUB_VENUES = [
  { place_id: "stub-fiu-campus-bistro", name: "Campus Bistro", lat: 25.756, lng: -80.376, primary_type: "restaurant", price_level: 2, rating: 4.5, user_rating_count: 180, minutes: [8, 11, 14] },
  { place_id: "stub-sweetwater-kitchen", name: "Sweetwater Kitchen", lat: 25.763, lng: -80.373, primary_type: "restaurant", price_level: 2, rating: 4.6, user_rating_count: 240, minutes: [10, 12, 15] },
  { place_id: "stub-fiu-grill", name: "FIU Grill", lat: 25.754, lng: -80.38, primary_type: "restaurant", price_level: 2, rating: 4.4, user_rating_count: 130, minutes: [9, 13, 16] },
  { place_id: "stub-sweetwater-bistro", name: "Sweetwater Bistro", lat: 25.768, lng: -80.367, primary_type: "restaurant", price_level: 2, rating: 4.3, user_rating_count: 115, minutes: [12, 16, 18] },
  { place_id: "stub-campus-table", name: "Campus Table", lat: 25.749, lng: -80.385, primary_type: "restaurant", price_level: 2, rating: 4.2, user_rating_count: 95, minutes: [14, 17, 20] },
] as const;

/** Temporary FIU venues used until the live Places/Routes issue lands. */
export function stubRankedVenues(memberIds: readonly string[]): RankedVenue[] {
  return STUB_VENUES.map((venue) => {
    const travel_minutes = Object.fromEntries(
      memberIds.map((userId, index) => [userId, venue.minutes[index % venue.minutes.length]!]),
    );
    const minutes = Object.values(travel_minutes);
    const max_travel_min = Math.max(...minutes);
    return {
      place_id: venue.place_id,
      name: venue.name,
      lat: venue.lat,
      lng: venue.lng,
      primary_type: venue.primary_type,
      price_level: venue.price_level,
      rating: venue.rating,
      user_rating_count: venue.user_rating_count,
      travel_minutes,
      max_travel_min,
      route_score: max_travel_min + 0.1 * minutes.reduce((sum, minute) => sum + minute, 0),
    };
  });
}

/** EventOption snapshots for top-five venues that were not selected for voting. */
export function unusedVenueSnapshots(
  venues: readonly RankedVenue[],
  options: readonly Pick<EventOption, "place_id">[],
): EventOption[] {
  const selectedPlaceIds = new Set(options.map((option) => option.place_id));
  return [...venues]
    .sort((a, b) => a.route_score - b.route_score || a.place_id.localeCompare(b.place_id))
    .slice(0, 5)
    .map((venue, index) => ({ venue, rank: index + 1 }))
    .filter(({ venue }) => !selectedPlaceIds.has(venue.place_id))
    .map(({ venue, rank }) => ({
      ...venue,
      rank,
      facts_line: factsLine(venue),
      ai_blurb: null,
    }));
}

function curateContext(
  candidate: GroupSlot,
  favoritesByUser: ReadonlyMap<string, readonly { category: string }[]>,
): CurateContext {
  const favorite_counts: Record<string, number> = {};
  for (const userId of candidate.group.memberIds) {
    for (const favorite of favoritesByUser.get(userId) ?? []) {
      favorite_counts[favorite.category] = (favorite_counts[favorite.category] ?? 0) + 1;
    }
  }
  const local = getLocalParts(candidate.slot.start, candidate.group.timezone);
  return {
    vibe_tag: candidate.slot.vibe_tag,
    slot_local: `${local.weekday} ${formatTimeHHMM(candidate.slot.start, candidate.group.timezone)}–${formatTimeHHMM(candidate.slot.end, candidate.group.timezone)}`,
    favorite_counts,
  };
}

function optionData(option: EventOption) {
  return {
    rank: option.rank,
    placeId: option.place_id,
    name: option.name,
    lat: option.lat,
    lng: option.lng,
    primaryType: option.primary_type,
    priceLevel: option.price_level,
    rating: option.rating,
    userRatingCount: option.user_rating_count,
    travelMinutes: option.travel_minutes,
    maxTravelMin: Math.round(option.max_travel_min),
    routeScore: option.route_score,
    factsLine: option.facts_line,
    aiBlurb: option.ai_blurb,
  };
}

export async function runPipeline(now = new Date()): Promise<void> {
  const [users, friendships, explicitGroups, events] = await Promise.all([
    prisma.user.findMany({ include: { busyBlocks: true, favorites: true } }),
    prisma.friendship.findMany(),
    prisma.explicitGroup.findMany({ include: { members: true } }),
    prisma.event.findMany({ include: { participants: true } }),
  ]);

  const groups = candidateGroups(users, friendships, explicitGroups);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const favoritesByUser = new Map(users.map((user) => [user.id, user.favorites]));
  const groupSlots: GroupSlot[] = [];

  for (const group of groups) {
    const members = group.memberIds.map((id) => usersById.get(id)).filter((user) => user !== undefined);
    if (members.length !== group.memberIds.length) continue;
    const availability = members.map((user) => ({
      id: user.id,
      timezone: user.timezone,
      busyBlocks: user.busyBlocks.map((block) => ({ start: block.startsAt, end: block.endsAt })),
      openEvents: events
        .filter((event) =>
          (event.status === "voting" || event.status === "confirmed") &&
          event.participants.some((participant) => participant.userId === user.id),
        )
        .map((event) => ({ start: event.startsAt, end: event.endsAt })),
    }));
    for (const window of freeWindows(availability, now, {
      timezone: group.timezone,
      busyPaddingMin: env.BUSY_PADDING_MIN,
      minLeadHours: env.MIN_LEAD_HOURS,
      horizonDays: env.MATCH_HORIZON_DAYS,
    })) {
      const slot = classifySlot(window, group.timezone);
      if (slot) groupSlots.push({ group, slot });
    }
  }

  const selected = selectCandidates(groupSlots, friendships, events, now, env.COOLDOWN_HOURS);
  for (const candidate of selected) {
    const rankedVenues = stubRankedVenues(candidate.group.memberIds);
    const options = await curateVenues(
      rankedVenues,
      curateContext(candidate, favoritesByUser),
    );
    if (options.length !== 3) throw new Error(`Venue curation returned ${options.length} options; expected 3`);

    const created = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.event.findFirst({
        where: { groupKey: candidate.group.groupKey, status: { in: ["voting", "confirmed"] } },
        select: { id: true },
      });
      if (duplicate) return null;
      return tx.event.create({
        data: {
          groupKey: candidate.group.groupKey,
          sourceGroupId: candidate.group.sourceGroupId,
          status: "voting",
          startsAt: candidate.slot.start,
          endsAt: candidate.slot.end,
          vibeTag: candidate.slot.vibe_tag,
          timezone: candidate.group.timezone,
          backupVenues: unusedVenueSnapshots(rankedVenues, options),
          voteClosesAt: new Date(now.getTime() + env.VOTE_TIMEOUT_SEC * 1_000),
          participants: {
            create: candidate.group.memberIds.map((userId) => ({ userId, voteStatus: "invited" })),
          },
          options: { create: options.map(optionData) },
        },
        select: { id: true },
      });
    });
    if (created) await openVoting(created.id);
  }
}

export function triggerMatcher(): Promise<void> {
  if (running) {
    rerunRequested = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        rerunRequested = false;
        await runPipeline();
      } while (rerunRequested);
    } finally {
      running = null;
    }
  })();
  return running;
}
