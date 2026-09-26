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
export const TravelMode = z.enum(["DRIVE"]); // decided 2026-09-26

export type VibeTag = z.infer<typeof VibeTag>;
export type EventStatus = z.infer<typeof EventStatus>;
export type VoteStatus = z.infer<typeof VoteStatus>;

// ---------- auth / profile (Ojas) ----------
export const Username = z.string().min(3).max(24).regex(/^[a-z0-9_]+$/);
export const DisplayName = z.string().trim().min(1).max(40);
export const Bio = z.string().trim().max(160);
/** How any user appears to others: display_name falls back to username. Never email or close-friend status. */
export const PublicUser = z.object({ id: Id, username: z.string(), display_name: z.string() });

export const SignupRequest = z.object({
  email: z.string().email(),
  username: Username,
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
  email_verified: z.boolean(),
  display_name: z.string().nullable(), // as set (null = not set); others see it via PublicUser
  bio: z.string().nullable(),
});
export const VerifyEmailRequest = z.object({ code: z.string().regex(/^\d{6}$/) });
export const PatchMeRequest = z
  .object({
    timezone: IanaTimezone,
    home_lat: z.number().min(-90).max(90), // server rounds to 3 decimals
    home_lng: z.number().min(-180).max(180),
    travel_mode: TravelMode,
    display_name: DisplayName.nullable(), // null clears it
    bio: Bio.nullable(),
    username: Username, // at most once per 30 days; 409 username_taken / username_cooldown
  })
  .partial();
/** Starts an email change: a code goes to the new address; the email switches on confirm. */
export const ChangeEmailRequest = z.object({ new_email: z.string().email(), password: z.string() });
export const ConfirmEmailChangeRequest = z.object({ code: z.string().regex(/^\d{6}$/) });
export const FriendshipState = z.enum(["none", "requested", "incoming", "friends"]);
export const PublicProfile = PublicUser.extend({
  bio: z.string().nullable(),
  friendship: FriendshipState,
  squads: z.array(z.object({ id: Id, name: z.string() })), // squads we're both active in
});

// ---------- busy blocks (Riley) ----------
export const BusyBlock = z.object({ starts_at: Instant, ends_at: Instant });
export const PutBusyBlocksRequest = z.object({
  horizon_start: Instant,
  horizon_end: Instant,
  blocks: z.array(BusyBlock).max(2000),
});
export const PutBusyBlocksResponse = z.object({ stored: z.number().int() });

// ---------- friends (Ojas) ----------
export const UserSearchResult = PublicUser; // never reveals "added you"
export const UserSearchResponse = z.object({ users: z.array(UserSearchResult) });
// Close friends: my silent choices only. Never says whether they chose me back.
export const CloseFriend = PublicUser;
export const CloseFriendsResponse = z.object({ friends: z.array(CloseFriend) });
export const AddCloseFriendRequest = z.object({ username: z.string() }); // 409 unless we're accepted friends

// Friends: the visible request/accept layer. `close` is MY flag only.
export const Friend = PublicUser.extend({ close: z.boolean() });
export const FriendsResponse = z.object({ friends: z.array(Friend) });
export const SendFriendRequest = z.object({ username: z.string() });
/** "friends" when they had already requested me, so this accepted it. */
export const SendFriendRequestResponse = z.object({ status: z.enum(["requested", "friends"]) });
export const FriendRequest = z.object({ id: Id, user: UserSearchResult, requested_at: Instant });
export const FriendRequestsResponse = z.object({ incoming: z.array(FriendRequest), outgoing: z.array(FriendRequest) });

// ---------- squads (Ojas) ----------
// Joining needs the invitee's yes; in a squad of 3+ active members any member can also
// object (remove the invite) within 24 h of it being sent.
export const SquadName = z.string().trim().min(1).max(40);
export const SquadMemberStatus = z.enum(["invited", "active"]);
export const CreateSquadRequest = z.object({ name: SquadName, invitee_ids: z.array(Id).min(1).max(5) });
export const InviteToSquadRequest = z.object({ invitee_ids: z.array(Id).min(1).max(5) });
export const RespondToSquadRequest = z.object({ accept: z.boolean() });
export const RenameSquadRequest = z.object({ name: SquadName });
export const SquadMember = PublicUser.extend({
  status: SquadMemberStatus,
  joins_at: Instant.nullable(), // accepted, waiting out the objection window
});
export const Squad = z.object({ id: Id, name: z.string(), my_status: SquadMemberStatus, members: z.array(SquadMember) });
export const SquadsResponse = z.object({ squads: z.array(Squad) });

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

export const CurateContext = z.object({
  vibe_tag: VibeTag,
  slot_local: z.string(), // e.g. "Thu 6:30–8:30pm"
  favorite_counts: z.record(z.string(), z.number().int()),
});
export type CurateContext = z.infer<typeof CurateContext>;

export const EventCardPayload = z.object({
  id: Id,
  status: EventStatus,
  starts_at: Instant,
  ends_at: Instant,
  timezone: IanaTimezone,
  vibe_tag: VibeTag,
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
  events: z.array(EventCardPayload.pick({ id: true, status: true, starts_at: true, vibe_tag: true })),
});

export const VoteRequest = z.object({ option_id: Id });
export const ReportClosedRequest = z.object({ current_place_id: z.string() });

// ---------- expenses (Ojas, stretch) ----------
export const CreateExpenseRequest = z.object({
  total_cents: z.number().int().positive(),
  description: z.string().max(120),
});
export const PatchExpenseSplitRequest = z.object({ settled: z.boolean() });

// ---------- errors ----------
export const ApiError = z.object({ error: z.string(), message: z.string().optional() });
