// Owner: Riley — the matcher pipeline (plan §2–§7), behind ONE in-process mutex.
// Every trigger (cron, handshake, busy-block PUT, /internal/run-matcher)
// calls triggerMatcher(); never call the pipeline around it.
import type { CurateContext, EventOption, RankedVenue } from "@web/contract";
import { env } from "../../env";
import { prisma } from "../../lib/prisma";
import { curateVenues, factsLine } from "../intelligence/curateVenues";
import { fetchCandidates } from "../venues/liveVenues";
import { openVoting } from "../voting/lifecycle";
import { candidateGroups, selectCandidates, type GroupSlot, type MatchingEvent } from "./candidates";
import { classifySlot, formatTimeHHMM, freeWindows, getLocalParts } from "./timeMath";

export { freeWindows, classifySlot } from "./timeMath";

let running: Promise<void> | null = null;
let rerunRequested = false;

export function openEventsByParticipant(events: readonly MatchingEvent[]): Map<string, MatchingEvent[]> {
  const byParticipant = new Map<string, MatchingEvent[]>();
  for (const event of events) {
    for (const participant of event.participants) {
      const participantEvents = byParticipant.get(participant.userId) ?? [];
      participantEvents.push(event);
      byParticipant.set(participant.userId, participantEvents);
    }
  }
  return byParticipant;
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
  const [friendships, explicitGroups] = await Promise.all([
    prisma.friendship.findMany(),
    prisma.explicitGroup.findMany({ include: { members: true } }),
  ]);

  // ponytail: discovery reads lightweight identities for relationship endpoints, then loads
  // busy blocks and favorites only for users who can form a candidate group.
  const referencedUserIds = [...new Set([
    ...friendships.flatMap((friendship) => [friendship.userLowId, friendship.userHighId]),
    ...explicitGroups.flatMap((group) => group.members.map((member) => member.userId)),
  ])].sort();
  if (!referencedUserIds.length) return;
  const identities = await prisma.user.findMany({
    where: { id: { in: referencedUserIds } },
    select: { id: true, timezone: true },
  });
  const groups = candidateGroups(identities, friendships, explicitGroups);
  if (!groups.length) return;

  const candidateUserIds = [...new Set(groups.flatMap((group) => group.memberIds))].sort();
  const groupKeys = groups.map((group) => group.groupKey);
  const cooldownSince = new Date(now.getTime() - env.COOLDOWN_HOURS * 60 * 60 * 1_000);
  const [users, openEvents, cooldownEvents] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: candidateUserIds } },
      include: { busyBlocks: true, favorites: true },
    }),
    prisma.event.findMany({
      where: {
        status: { in: ["voting", "confirmed"] },
        participants: { some: { userId: { in: candidateUserIds } } },
      },
      include: { participants: true },
    }),
    env.COOLDOWN_HOURS > 0
      ? prisma.event.findMany({
        where: {
          groupKey: { in: groupKeys },
          status: { in: ["expired", "chatted"] },
          resolvedAt: { gte: cooldownSince },
        },
        include: { participants: true },
      })
      : Promise.resolve([]),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));
  const favoritesByUser = new Map(users.map((user) => [user.id, user.favorites]));
  const eventsByParticipant = openEventsByParticipant(openEvents);
  const groupSlots: GroupSlot[] = [];

  for (const group of groups) {
    const members = group.memberIds.map((id) => usersById.get(id)).filter((user) => user !== undefined);
    if (members.length !== group.memberIds.length) continue;
    const availability = members.map((user) => ({
      id: user.id,
      timezone: user.timezone,
      busyBlocks: user.busyBlocks.map((block) => ({ start: block.startsAt, end: block.endsAt })),
      openEvents: (eventsByParticipant.get(user.id) ?? [])
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

  const selected = selectCandidates(groupSlots, friendships, [...openEvents, ...cooldownEvents], now, env.COOLDOWN_HOURS);
  for (const candidate of selected) {
    const venueMembers = candidate.group.memberIds
      .map((id) => usersById.get(id))
      .filter((user) => user !== undefined)
      .map((user) => ({
        id: user.id,
        timezone: user.timezone,
        homeLat: user.homeLat,
        homeLng: user.homeLng,
        favorites: user.favorites,
      }));
    const rankedVenues = await fetchCandidates(candidate.slot, venueMembers);
    if (rankedVenues.length < 3) continue;
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
