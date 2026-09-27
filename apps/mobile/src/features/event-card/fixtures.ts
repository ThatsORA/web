// Owner: Andy — stub EventCardPayloads, one per card state, so the card works before the backend does.
// Demo cast: A = presenter (me), B = riley, C = ojas. Thu 6:30–8:30pm dinner near FIU.
import type { EventCardPayload, EventOption } from "@web/contract";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ME = { id: id(1), username: "presenter", display_name: "presenter" };
const RILEY = { id: id(2), username: "riley", display_name: "riley" };
const OJAS = { id: id(3), username: "ojas", display_name: "ojas" };
const EVERYONE = [ME, RILEY, OJAS];
// A squad hangout (#206): squad members see each other and each other's visible pass.
const inSquad = (passed: typeof EVERYONE) =>
  EVERYONE.map((p) => ({ ...p, invite_source: "squad" as const, passed: passed.includes(p) }));

function option(n: number, name: string, facts: string, blurb: string | null, minutes: [number, number, number]): EventOption {
  return {
    id: id(100 + n),
    place_id: `stub_place_${n}`,
    name,
    lat: 25.757 + n * 0.004,
    lng: -80.374 + n * 0.004,
    primary_type: "restaurant",
    price_level: 2,
    rating: 4.5,
    user_rating_count: 800,
    travel_minutes: { [ME.id]: minutes[0], [RILEY.id]: minutes[1], [OJAS.id]: minutes[2] },
    max_travel_min: Math.max(...minutes),
    route_score: Math.max(...minutes) + 0.1 * minutes.reduce((a, b) => a + b, 0),
    rank: n,
    facts_line: facts,
    ai_blurb: blurb,
  };
}

const OPTIONS = [
  option(1, "Latin House Grill", "★4.6 · $$ · max 14 min travel", "Burgers with a Cuban twist; roomy booths for three.", [9, 14, 12]),
  option(2, "Sergio's", "★4.5 · $$ · max 11 min travel", "Late-night Cuban classics, fast service.", [7, 11, 10]),
  option(3, "Pollo Tropical", "★4.2 · $ · max 9 min travel", null, [5, 9, 8]),
];

const MATCH_REASON = "You three haven't hung out in 10 days. Thursday works for everyone.";

const voting: EventCardPayload = {
  id: id(50),
  status: "voting",
  starts_at: "2026-10-01T18:30:00-04:00",
  ends_at: "2026-10-01T20:30:00-04:00",
  timezone: "America/New_York",
  vibe_tag: "dinner",
  viewer: { invite_source: "squad", pass_kind: "visible", full_roster: false, chat: "open" },
  participants: inSquad([]),
  options: OPTIONS,
  progress: { responded: 1, total: 3 },
  my_status: "invited",
  my_option_id: null,
  vote_closes_at: "2026-09-26T10:01:30-04:00",
  outcome: null,
};

const confirmed: EventCardPayload = {
  ...voting,
  status: "confirmed",
  progress: { responded: 3, total: 3 },
  my_status: "confirmed",
  my_option_id: OPTIONS[0]!.id!,
  participants: inSquad([OJAS]),
  outcome: {
    venue: OPTIONS[0]!,
    venue_status: "open",
    attendees: [ME, RILEY], // ojas passed
    tallies: { [OPTIONS[0]!.id!]: 2, [OPTIONS[1]!.id!]: 0, [OPTIONS[2]!.id!]: 0 },
  },
};

export const FIXTURES: { label: string; card: EventCardPayload; swapped?: boolean }[] = [
  { label: "Voting", card: voting },
  { label: "Waiting (voted)", card: { ...voting, my_status: "voted", my_option_id: OPTIONS[1]!.id!, progress: { responded: 2, total: 3 } } },
  { label: "Waiting (ghost passed)", card: { ...voting, my_status: "ghost_passed", progress: { responded: 2, total: 3 } } },
  { label: "Voting (with match reason)", card: { ...voting, match_reason: MATCH_REASON } },
  { label: "Confirmed", card: confirmed },
  { label: "Confirmed (with match reason)", card: { ...confirmed, match_reason: MATCH_REASON } },
  {
    label: "Swapped",
    card: { ...confirmed, outcome: { ...confirmed.outcome!, venue: OPTIONS[1]! } },
    swapped: true,
  },
  {
    label: "Chatted",
    card: {
      ...voting,
      status: "chatted",
      progress: { responded: 3, total: 3 },
      my_status: "voted",
      outcome: { venue: null, venue_status: "open", attendees: EVERYONE, tallies: null },
    },
  },
  {
    label: "Expired",
    card: {
      ...voting,
      status: "expired",
      progress: { responded: 3, total: 3 },
      my_status: "ghost_passed",
      outcome: { venue: null, venue_status: "open", attendees: [], tallies: null },
    },
  },
  {
    label: "Completed (ended event)",
    card: {
      ...confirmed,
      status: "completed",
      starts_at: "2026-09-20T18:30:00-04:00",
      ends_at: "2026-09-20T20:30:00-04:00",
      viewer: { ...confirmed.viewer, chat: "read_only" },
    },
  },
];
