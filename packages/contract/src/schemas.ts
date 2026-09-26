// API contract v2 — mirrors wiki/plan.md "API Contract v2" and "Schema v2".
// Server parses request bodies with these; mobile parses responses with these.
// Changing this file needs the `contract` label + the other two approvals.
import { z } from "zod";

// ---------- primitives ----------
export const Id = z.string().uuid();
export const Instant = z.string().datetime({ offset: true }); // ISO 8601, always with offset
export const IanaTimezone = z.string().min(1); // e.g. "America/New_York"

export const VibeTag = z.enum(["quick_coffee", "casual_hangout", "dinner", "night_out"]);
export const EventStatus = z.enum(["voting", "confirmed", "chatted", "expired", "completed"]);
export const VoteStatus = z.enum(["invited", "voted", "ghost_passed", "confirmed"]);
export const VenueStatus = z.enum(["open", "reported_closed"]);
export const TravelMode = z.enum(["DRIVE", "TRANSIT", "WALK", "BICYCLE"]); // decided 2026-09-26

export type VibeTag = z.infer<typeof VibeTag>;
export type EventStatus = z.infer<typeof EventStatus>;
export type VoteStatus = z.infer<typeof VoteStatus>;

// ---------- auth / profile (Ojas) ----------
export const SignupRequest = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(24).regex(/^[a-z0-9_]+$/),
  password: z.string().min(8),
  timezone: IanaTimezone,
});
export const LoginRequest = z.object({ email: z.string().email(), password: z.string() });
export const AuthResponse = z.object({ token: z.string(), user_id: Id });

export const Me = z.object({
  id: Id,
  username: z.string(),
  email: z.string().email(),
  timezone: IanaTimezone,
  home_lat: z.number().nullable(),
  home_lng: z.number().nullable(),
  travel_mode: TravelMode,
});
export const PatchMeRequest = z
  .object({
    timezone: IanaTimezone,
    home_lat: z.number().min(-90).max(90), // server rounds to 3 decimals
    home_lng: z.number().min(-180).max(180),
    travel_mode: TravelMode,
  })
  .partial();

export const SavePushTokenRequest = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android", "web"]).default("ios"),
});
export type SavePushTokenRequest = z.infer<typeof SavePushTokenRequest>;

export const DeletePushTokenRequest = z.object({
  token: z.string().min(1),
});
export type DeletePushTokenRequest = z.infer<typeof DeletePushTokenRequest>;

// ---------- busy blocks (Riley) ----------
export const BusyBlock = z.object({ starts_at: Instant, ends_at: Instant });
export const PutBusyBlocksRequest = z.object({
  horizon_start: Instant,
  horizon_end: Instant,
  blocks: z.array(BusyBlock).max(2000),
});
export const PutBusyBlocksResponse = z.object({ stored: z.number().int() });

export const GoogleCalendarStatusResponse = z.object({ connected: z.boolean(), last_synced_at: z.string().nullable(), revoked: z.boolean().optional() });
export const GoogleCalendarStartResponse = z.object({ url: z.string() });
export const GoogleCalendarStartRequest = z.object({ redirect_uri: z.string().optional() });

export type GoogleCalendarStatusResponse = z.infer<typeof GoogleCalendarStatusResponse>;
export type GoogleCalendarStartResponse = z.infer<typeof GoogleCalendarStartResponse>;
export type GoogleCalendarStartRequest = z.infer<typeof GoogleCalendarStartRequest>;

// ---------- friends (Ojas) ----------
export const UserSearchResult = z.object({ id: Id, username: z.string() }); // never reveals "added you"
export const UserSearchResponse = z.object({ users: z.array(UserSearchResult) });
export const CloseFriend = z.object({ id: Id, username: z.string() });
export const CloseFriendsResponse = z.object({ friends: z.array(CloseFriend) });
export const AddCloseFriendRequest = z.object({ username: z.string() });

export type UserSearchResult = z.infer<typeof UserSearchResult>;
export type UserSearchResponse = z.infer<typeof UserSearchResponse>;
export type CloseFriend = z.infer<typeof CloseFriend>;
export type CloseFriendsResponse = z.infer<typeof CloseFriendsResponse>;
export type AddCloseFriendRequest = z.infer<typeof AddCloseFriendRequest>;

// ---------- favorites (Andy) ----------
export const PutFavoritesRequest = z.object({ categories: z.array(z.string()).max(20) });

// ---------- venues / events ----------
/** Riley's matcher output → Ojas's curateVenues() input. */
export const RankedVenue = z.object({
  place_id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  primary_type: z.string().nullable(),
  price_level: z.number().int().min(1).max(4).nullable(),
  rating: z.number().nullable(),
  user_rating_count: z.number().int().nullable(),
  travel_minutes: z.record(Id, z.number()), // { [user_id]: minutes }
  max_travel_min: z.number(),
  route_score: z.number(), // max + 0.1 * sum; lower is better
});
export type RankedVenue = z.infer<typeof RankedVenue>;

/** One vote choice, and the snapshot shape stored in events.backup_venues. */
export const EventOption = RankedVenue.extend({
  id: Id.optional(), // absent for backup snapshots never shown as options
  rank: z.number().int(),
  facts_line: z.string(), // deterministic: "★4.6 · $$ · max 14 min travel"
  ai_blurb: z.string().max(90).nullable(), // null = Gemini fallback
});
export type EventOption = z.infer<typeof EventOption>;

export interface OptionRowLike {
  id: string;
  rank: number;
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  primaryType: string | null;
  priceLevel: number | null;
  rating: number | null;
  userRatingCount: number | null;
  travelMinutes: unknown;
  maxTravelMin: number;
  routeScore: number;
  factsLine: string;
  aiBlurb: string | null;
}

export function optionFromRow(row: OptionRowLike): EventOption & { id: string } {
  return EventOption.parse({
    id: row.id,
    rank: row.rank,
    place_id: row.placeId,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    primary_type: row.primaryType,
    price_level: row.priceLevel,
    rating: row.rating,
    user_rating_count: row.userRatingCount,
    travel_minutes: row.travelMinutes,
    max_travel_min: row.maxTravelMin,
    route_score: row.routeScore,
    facts_line: row.factsLine,
    ai_blurb: row.aiBlurb,
  }) as EventOption & { id: string };
}

export const CurateContext = z.object({
  vibe_tag: VibeTag,
  slot_local: z.string(), // e.g. "Thu 6:30–8:30pm"
  favorite_counts: z.record(z.string(), z.number().int()),
});
export type CurateContext = z.infer<typeof CurateContext>;

export const CreateEventRequest = z.object({
  invitee_ids: z.array(Id).min(1).max(5),
  vibe_tag: VibeTag.optional(),
  earliest: Instant.optional(),
  latest: Instant.optional(),
});
export type CreateEventRequest = z.infer<typeof CreateEventRequest>;

export const EventCardPayload = z.object({
  created_by: z.object({ id: Id, username: z.string() }).nullable().optional(),
  id: Id,
  status: EventStatus,
  starts_at: Instant,
  ends_at: Instant,
  timezone: IanaTimezone,
  vibe_tag: VibeTag,
  match_reason: z.string().max(90).nullable().optional(),
  participants: z.array(z.object({ id: Id, username: z.string() })),
  options: z.array(EventOption), // the 3 choices while voting
  progress: z.object({ responded: z.number().int(), total: z.number().int() }),
  my_status: VoteStatus,
  my_option_id: Id.nullable(), // only the caller's own vote, never anyone else's
  vote_closes_at: Instant,
  /** Present once resolved. Tallies are only revealed after close. */
  outcome: z
    .object({
      venue: EventOption.nullable(),
      venue_status: VenueStatus,
      attendees: z.array(z.object({ id: Id, username: z.string() })),
      tallies: z.record(Id, z.number().int()).nullable(),
    })
    .nullable(),
});
export type EventCardPayload = z.infer<typeof EventCardPayload>;

export const EventsListResponse = z.object({
  events: z.array(EventCardPayload),
});
export type EventsListResponse = z.infer<typeof EventsListResponse>;

export const VoteRequest = z.object({ option_id: Id });
export const ReportClosedRequest = z.object({ current_place_id: z.string() });

// ---------- expenses (Ojas, stretch) ----------
export const CreateExpenseRequest = z.object({
  total_cents: z.number().int().positive(),
  description: z.string().max(120),
  // Custom split (#81); omitted → equal split. Must sum exactly to total_cents.
  splits: z.array(z.object({ user_id: Id, amount_cents: z.number().int().nonnegative() })).optional(),
});
export const PatchExpenseSplitRequest = z.object({ settled: z.boolean() });

// ---------- errors ----------
export const ApiError = z.object({ error: z.string(), message: z.string().optional() });
