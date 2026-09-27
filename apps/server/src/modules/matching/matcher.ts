// Owner: Riley — the matcher pipeline (plan §2–§7), behind ONE in-process mutex.
// Every trigger (cron, handshake, busy-block PUT, /internal/run-matcher)
// calls triggerMatcher(); never call the pipeline around it.
import type { CurateContext, EventOption, RankedVenue } from "@web/contract";
import { env } from "../../env";
import { prisma } from "../../lib/prisma";
import { chooseActivities, describeActivities } from "../intelligence/activities";
import { curateActivities, curateVenues, factsLine, type Curation } from "../intelligence/curateVenues";
import { scheduleDecisions } from "../intelligence/scheduleDecisions";
import { discoverPlaces, timeCandidates, type ActivityCandidate } from "../venues/discover";
import { fetchCandidates, type VenueMember } from "../venues/liveVenues";
import { openVoting } from "../voting/lifecycle";
import { candidateGroups, groupKey, rankCandidates, selectRankedCandidates, type GroupSlot, type MatchingEvent } from "./candidates";
import type { ResolvedManualSelection } from "./manualSelection";
import { mixerCandidates } from "./mixerCandidates";
import { classifySlot, earliestTimezone, formatTimeHHMM, freeWindows, getLocalParts, type ClassifiedSlot, type TimeWindow } from "./timeMath";

export { freeWindows, classifySlot } from "./timeMath";

let running: Promise<void> | null = null;
let rerunRequested = false;
let forceNext = false;

let mutexQueue: Promise<any> = Promise.resolve();
export function withMatcherMutex<T>(task: () => Promise<T>): Promise<T> {
  const next = mutexQueue.then(() => task());
  mutexQueue = next.catch(() => {});
  return next;
}

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
  const timezone = earliestTimezone(candidate.slot.start, Object.values(candidate.group.memberTimezones));
  const local = getLocalParts(candidate.slot.start, timezone);
  return {
    vibe_tag: candidate.slot.vibe_tag,
    slot_local: `${local.weekday} ${formatTimeHHMM(candidate.slot.start, timezone)}–${formatTimeHHMM(candidate.slot.end, timezone)}`,
    favorite_counts,
  };
}

export function timezoneClosestToVenueCentroid(
  members: readonly Pick<VenueMember, "id" | "timezone" | "homeLat" | "homeLng">[],
  venues: readonly Pick<EventOption, "lat" | "lng">[],
): string | null {
  if (!venues.length) return null;
  const latitude = venues.reduce((sum, venue) => sum + venue.lat, 0) / venues.length;
  const longitude = venues.reduce((sum, venue) => sum + venue.lng, 0) / venues.length;
  const longitudeScale = Math.cos(latitude * Math.PI / 180);
  return members
    .filter((member) => member.homeLat !== null && member.homeLng !== null)
    .map((member) => ({
      member,
      distance: (member.homeLat! - latitude) ** 2 + ((member.homeLng! - longitude) * longitudeScale) ** 2,
    }))
    .sort((a, b) => a.distance - b.distance || a.member.id.localeCompare(b.member.id))[0]?.member.timezone ?? null;
}

export function optionData(option: EventOption) {
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
    activity: option.activity,
    startsAt: option.starts_at ? new Date(option.starts_at) : undefined,
    endsAt: option.ends_at ? new Date(option.ends_at) : undefined,
  };
}

/**
 * Nearby places labelled as activities (#322), each timed inside the free window, at least
 * MIN_LEAD_HOURS out and never before the slot start (the voting deadline derives from it).
 * Any failure → none, so the caller falls back to the fixed-vibe venues.
 */
async function activityCandidates(
  slot: ClassifiedSlot,
  window: TimeWindow,
  members: readonly VenueMember[],
  now: Date,
): Promise<ActivityCandidate[]> {
  const from = new Date(Math.max(slot.start.getTime(), now.getTime() + env.MIN_LEAD_HOURS * 3_600_000));
  try {
    const places = await discoverPlaces(slot, from, window.end, members);
    return timeCandidates(places, await describeActivities(places));
  } catch (e) {
    console.error("activity discovery", e);
    return [];
  }
}

export async function runPipeline(now = new Date(), { force = false }: { force?: boolean } = {}): Promise<void> {
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
  // Squads + Mixers (#320): whole squads (3–6 active members) and Riley's Mixers (#215). Friend pairs,
  // cliques and one-drop subsets are skipped. Manual hangouts never come through here.
  const squadKeys = new Set(explicitGroups.map((group) =>
    groupKey(group.members.filter((member) => member.status === "active").map((member) => member.userId))));
  const squads = candidateGroups(identities, [], explicitGroups).filter((group) => squadKeys.has(group.groupKey));
  const possibleMixers = mixerCandidates(identities, friendships, [], now);
  const groupsByKey = new Map(squads.map((group) => [group.groupKey, group]));
  for (const { group } of possibleMixers) {
    // A selected Squad keeps its provenance; otherwise a 4–6 person eligible group is a Mixer.
    if (!groupsByKey.get(group.groupKey)?.sourceGroupId) groupsByKey.set(group.groupKey, group);
  }
  const groups = [...groupsByKey.values()];
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
  const eligibleMixerKeys = new Set(mixerCandidates(identities, friendships, [...openEvents, ...cooldownEvents], now)
    .map(({ group }) => group.groupKey));
  const favoritesByUser = new Map(users.map((user) => [user.id, user.favorites]));
  const eventsByParticipant = openEventsByParticipant(openEvents);
  const groupSlots: GroupSlot[] = [];
  const windowBySlot = new Map<ClassifiedSlot, TimeWindow>();

  for (const group of groups) {
    if (group.isMixer && !eligibleMixerKeys.has(group.groupKey)) continue;
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
      busyPaddingMin: env.BUSY_PADDING_MIN,
      minLeadHours: env.MIN_LEAD_HOURS,
      horizonDays: env.MATCH_HORIZON_DAYS,
    })) {
      const slot = classifySlot(window, Object.values(group.memberTimezones));
      if (!slot) continue;
      groupSlots.push({ group, slot });
      windowBySlot.set(slot, window);
    }
  }

  const ranked = rankCandidates(groupSlots, friendships, now);
  // Preserve squad precedence, then offer anonymous Mixers before ordinary direct proposals.
  const priority = (group: typeof ranked[number]["group"]) => group.sourceGroupId ? 2 : group.isMixer ? 1 : 0;
  ranked.sort((a, b) => priority(b.group) - priority(a.group));
  const shortlist = selectRankedCandidates(
    ranked,
    [...openEvents, ...cooldownEvents],
    now,
    env.COOLDOWN_HOURS,
  );
  const selected = await scheduleDecisions(
    shortlist.map((candidate) => ({ ...candidate, window: windowBySlot.get(candidate.slot)! })),
    favoritesByUser,
    force,
  );
  for (const candidate of selected) {
    const members = candidate.group.memberIds.map((id) => usersById.get(id)).filter((user) => user !== undefined);
    const venueMembers = members.map((user) => ({
      id: user.id,
      timezone: user.timezone,
      homeLat: user.homeLat,
      homeLng: user.homeLng,
      favorites: user.favorites,
      travelMode: user.travelMode,
    }));
    const context = curateContext(candidate, favoritesByUser);
    // #322: activities discovered near the squad, each at its own time. #311: each member's private
    // profile scores them (server-only; Gemini never sees it). Fewer than 3 → the fixed-vibe venues.
    const activities = await activityCandidates(candidate.slot, candidate.window, venueMembers, now);
    const picks = await chooseActivities(activities, members.map((user) => ({
      activities: user.prefActivities,
      personality: user.prefPersonality,
      favorites: [...new Set(user.favorites.map((favorite) => favorite.category))],
    })), force);
    if (!picks) continue; // the squad's appeal is under the gate
    let rankedVenues: RankedVenue[] = activities;
    let curation: Curation;
    if (picks.length === 3) {
      curation = await curateActivities(picks, context);
    } else {
      // No venue-fit decision in the automated flow (#311): the 3 best by commute, Gemini writes the text.
      rankedVenues = await fetchCandidates(candidate.slot, venueMembers);
      if (rankedVenues.length < 3) continue;
      curation = await curateActivities([...rankedVenues].sort((a, b) => a.route_score - b.route_score).slice(0, 3), context);
    }
    const { options, matchReason } = curation;
    if (options.length !== 3) throw new Error(`Venue curation returned ${options.length} options; expected 3`);
    const eventTimezone = timezoneClosestToVenueCentroid(venueMembers, options) ??
      earliestTimezone(candidate.slot.start, Object.values(candidate.group.memberTimezones));

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
          isMixer: candidate.group.isMixer ?? false,
          status: "voting",
          startsAt: candidate.slot.start,
          endsAt: candidate.slot.end,
          vibeTag: candidate.slot.vibe_tag,
          timezone: eventTimezone,
          matchReason,
          backupVenues: unusedVenueSnapshots(rankedVenues, options),
          voteClosesAt: new Date(now.getTime() + env.VOTE_TIMEOUT_SEC * 1_000),
          participants: {
            create: candidate.group.memberIds.map((userId) => ({
              userId, voteStatus: "invited", ...(candidate.group.isMixer ? { inviteSource: "direct" as const } : {}),
            })),
          },
          options: { create: options.map(optionData) },
        },
        select: { id: true },
      });
    });
    if (created) await openVoting(created.id);
  }
}

/** `force` skips the propose and appeal gates (preference fit still picks the options); a coalesced forced call forces the rerun. */
export function triggerMatcher({ force = false }: { force?: boolean } = {}): Promise<void> {
  forceNext ||= force;
  if (running) {
    rerunRequested = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        rerunRequested = false;
        const forced = forceNext;
        forceNext = false;
        await runPipeline(new Date(), { force: forced });
      } while (rerunRequested);
    } finally {
      running = null;
      forceNext = false;
    }
  })();
  return running;
}

export async function createUserHangout(
  callerId: string,
  inviteeIds: string[],
  vibeTag?: import("@web/contract").VibeTag,
  earliest?: string,
  latest?: string,
  selection?: ResolvedManualSelection,
): Promise<{ eventId: string } | { error: "no_common_time" | "no_venues" | "already_open" }> {
  const memberIds = selection?.memberIds ?? [...new Set([callerId, ...inviteeIds])].sort();
  const participants = selection?.participants ?? memberIds.map((userId) => ({
    userId, inviteSource: userId === callerId ? "creator" as const : "direct" as const, sourceGroupIds: [],
  }));
  const now = new Date();

  const [users, openEvents] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: memberIds } },
      include: { busyBlocks: true, favorites: true },
    }),
    prisma.event.findMany({
      where: {
        status: { in: ["voting", "confirmed"] },
        participants: { some: { userId: { in: memberIds } } },
      },
      include: { participants: true },
    }),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));
  const eventsByParticipant = openEventsByParticipant(openEvents);

  if (users.length !== memberIds.length) return { error: "no_common_time" };

  const availability = memberIds.map((id) => {
    const user = usersById.get(id)!;
    return {
      id: user.id,
      timezone: user.timezone,
      busyBlocks: user.busyBlocks.map((block) => ({ start: block.startsAt, end: block.endsAt })),
      openEvents: (eventsByParticipant.get(user.id) ?? [])
        .map((event) => ({ start: event.startsAt, end: event.endsAt })),
    };
  });

  const earliestMs = earliest ? new Date(earliest).getTime() : -Infinity;
  const latestMs = latest ? new Date(latest).getTime() : Infinity;
  // Search far enough to reach `latest` ("next week" ends up to ~8 days out), capped at 14 days.
  const horizonDays = latest
    ? Math.min(14, Math.max(env.MATCH_HORIZON_DAYS, (latestMs - now.getTime()) / 86_400_000))
    : env.MATCH_HORIZON_DAYS;
  const windows = freeWindows(availability, now, {
    busyPaddingMin: env.BUSY_PADDING_MIN,
    minLeadHours: env.MIN_LEAD_HOURS,
    horizonDays,
  });

  let bestSlot = null;
  const timezones = Object.fromEntries(users.map((u) => [u.id, u.timezone]));

  for (const window of windows) {
    const start = new Date(Math.max(window.start.getTime(), earliestMs));
    const end = new Date(Math.min(window.end.getTime(), latestMs));
    if (start >= end) continue;

    const slot = classifySlot({ start, end }, Object.values(timezones), vibeTag);
    if (slot) {
      bestSlot = slot;
      break;
    }
  }

  if (!bestSlot) return { error: "no_common_time" };

  const groupKey = memberIds.join(",");
  const favoritesByUser = new Map(users.map((u) => [u.id, u.favorites]));
  const venueMembers = memberIds.map((id) => {
    const user = usersById.get(id)!;
    return {
      id: user.id,
      timezone: user.timezone,
      homeLat: user.homeLat,
      homeLng: user.homeLng,
      favorites: user.favorites,
    };
  });

  // fetchCandidates returns [] when any member has no home location.
  const rankedVenues = await fetchCandidates(bestSlot, venueMembers);
  if (rankedVenues.length < 3) return { error: "no_venues" };

  const group = { memberIds, memberTimezones: timezones, groupKey, sourceGroupId: null };
  const candidate = { group, slot: bestSlot, matchReason: null };

  const { options, matchReason } = await curateVenues(rankedVenues, curateContext(candidate, favoritesByUser));
  if (options.length !== 3) return { error: "no_venues" };

  const eventTimezone = timezoneClosestToVenueCentroid(venueMembers, options) ??
    earliestTimezone(bestSlot.start, Object.values(timezones));

  const createdId = await prisma.$transaction(async (tx) => {
    const duplicate = await tx.event.findFirst({
      where: { groupKey, status: { in: ["voting", "confirmed"] } }, select: { id: true },
    });
    if (duplicate) return null;
    const event = await tx.event.create({
      data: {
        groupKey,
        createdById: callerId,
        sourceGroupIds: selection?.squadIds ?? [],
        status: "voting",
        startsAt: bestSlot.start,
        endsAt: bestSlot.end,
        vibeTag: bestSlot.vibe_tag,
        timezone: eventTimezone,
        matchReason,
        backupVenues: unusedVenueSnapshots(rankedVenues, options),
        voteClosesAt: new Date(now.getTime() + env.VOTE_TIMEOUT_SEC * 1_000),
        participants: {
          create: participants.map(({ userId, inviteSource, sourceGroupIds }) => ({
            userId, voteStatus: "invited", inviteSource, sourceGroupIds,
          })),
        },
        options: { create: options.map(optionData) },
      },
      select: { id: true },
    });
    return event.id;
  });

  if (!createdId) return { error: "already_open" };
  await openVoting(createdId);
  return { eventId: createdId };
}
