# Web — Hackathon Plan (v2.1)

36-hour hackathon build. Team: Andy, Ojas, Riley. Two AI agents per person
across three vendors (Claude, Antigravity, ChatGPT), all writing code in
parallel against one repo that starts empty (capstone concept only). This
doc is the source of truth: AGENTS.md and the other wiki pages follow it,
and wherever they disagree, this doc wins.

## Concept

Web removes the coordination work from hanging out. It reads when friends
are busy, finds free windows that overlap across each squad, suggests venues that fit the moment and are fair for everyone to
get to, and settles the plan with an anonymous vote. What sets it apart
from Partiful and Timeful is that nobody has to create the event: Web
proposes hangouts on its own in the background.

## The Demo Script (everything below serves this)

This runs about 3 minutes on three real phones. Phone A belongs to the
presenter, who is a brand-new user. Phones B and C are Riley and Ojas,
using seeded accounts.

1. **Sign up (A).** Enter email, username and password. The timezone is
   picked up from the device automatically (`expo-localization`). Grant location permission;
   the home location is stored rounded to about 100 m.
2. **Calendar (A).** Grant calendar permission. Show the callout:
   "Synced 23 busy blocks. We never read event titles."
3. **Quick-tap favorites (A).** Tap coffee, tacos, casual dining.
4. **Friend requests (A).** Search for Riley and Ojas and tap Add friend;
   each shows "Requested". Friendship is visible, like any social app.
5. **Accept + join the squad (B, C, A).** Riley and Ojas accept the
   request on their Friends tab. Riley opens Squads and invites the
   presenter to the seeded squad **Thursday crew** (Riley + Ojas); A taps
   **Join** and is active at once (#275). The scheduler proposes to
   squads only (#320), so the squad forms the group; close-friend stars
   no longer do.
6. **The proposal appears (A, B, C).** An operator phone (Ojas on C, or
   Andy) taps **Find a hangout now** (`POST /scheduler/run`, #232/#233);
   the button is operator-only (#403), so the presenter's phone doesn't show it. An event card for the squad
   arrives on all three phones within a few seconds (a "Finding a time…" state covers the
   wait): "Thu · 6:30–8:30pm · Dinner". It shows
   three venue options. Each has an AI blurb plus a line of facts, for
   example "★4.6 · $$ · max 14 min travel".
7. **Pass (C).** Ojas taps Pass. Every phone shows "2 of 3 responded".
   In a squad hangout the pass is visible ("can't make it", #210); a
   Ghost Pass only exists for direct invites.
8. **Vote (A, B).** Both vote, voting closes early because everyone has
   responded, and the card flips to **Confirmed**. It shows the venue,
   each person's travel time, and a map pin.

> **Superseded by #206 (per-viewer privacy).** Steps 6–8 describe the
> original shared participant card, where every phone listed everyone and,
> after close, an attendee list that showed who ghost passed by their
> absence. That no longer holds. Since #320 the demo proposal is an
> automated squad hangout with no human creator: all three are squad
> invitees, so each phone sees the whole squad, their passes are visible,
> and the squad gets chat (#212). See §9 "Who sees what".
9. **Finale: "It's closed" (B).** Riley taps the button, and all phones
   swap instantly to the backup venue: "Swapped to X · max 11 min".

Two things are deliberately not in the demo: expenses and the fallback
chat. That is the reason they're stretch work or cut below.

## Scope

**Build (the demo depends on these):** sign-up and onboarding, busy-block
sync from the device calendar, friends and squads, the matcher (free
windows, group formation, vibe and slot, deterministic ranking, the
decision-model propose gate), venue pipeline (Places, then route matrix,
then the decision-model fit filter and Gemini blurbs),
anonymous voting over Socket.io, Ghost Pass, resolution, and
"It's closed".

**Stretch (only after the hour-20 checkpoint passes):**
1. **MongoDB Atlas showcase** (for the MongoDB sponsor challenge). Pick
   one option at the hour-8 checkpoint; build it in hours 20–28.
   - **A. Geospatial venue cache (Riley):** store Places results in an
     Atlas collection with a `2dsphere` index and a TTL index (e.g.
     24 h). Nearby Search checks the cache with `$geoNear` before calling
     Google. This cuts API calls and cost, gives `DEMO_MODE` real data to
     fall back on, and is a visible "Atlas does real work" story. Indexes
     are created with `prisma.$runCommandRaw` in a small setup script,
     because Prisma can't declare them.
   - **B. Change streams → sockets (Ojas):** the server watches the
     `events` and `event_participants` collections, and each change emits
     the matching socket event. The database becomes the source of every
     live update, instead of each endpoint calling `emitToUsers()`.
     Riskier: it rewires the realtime path late in the build, and change
     streams must be confirmed to work on the free M0 tier first.
   - **Leaning A:** lower risk, and it helps the Mobility pitch too.
2. **Expense ledger:** equal splits and a manual "settled" toggle.

**Cut (mention as future work in the pitch):**
- Server-side Google or Apple calendar OAuth
- Gemini closure-risk ordering of backups
- Fallback group chat
- Custom expense splits
- Push notifications (in-app sockets only)

## What Changed from v1 and Why

| # | v1 problem | v2 resolution |
| --- | --- | --- |
| 1 | `availability_intervals` stored day_of_week + UTC times, so it couldn't hold dated busy blocks and broke at UTC midnight. At UTC−4, any slot after 8pm local starts on a different UTC day. It was also unclear whether rows meant busy or free. | Replaced by `busy_blocks` with `starts_at`/`ends_at` as timestamptz. Only busy blocks are stored; free windows are computed on the fly. Added the missing tables `event_options` and `votes`, plus `users.home_lat/lng`. Money is stored as integer cents. `meetup_point` is removed (the venue *is* the meetup point). |
| 2 | Server OAuth was the riskiest item and sat on the critical path, and Apple has no server calendar API. | `expo-calendar` reads every calendar synced to the phone (Google and iCloud included). The client computes busy blocks and PUTs them. There's no OAuth, and event text never leaves the device. The hour-8 checkpoint runs on seeded data. |
| 3 | Distance Matrix is Legacy and can't be enabled in new Cloud projects. The plan also had no origin locations, and "combined travel time" rewards unfair outcomes. | Use Routes API `computeRouteMatrix` and Places API (New). Origins are the home locations set at onboarding. Cost = worst commute + 0.1 × total commute. |
| 4 | The slices weren't really vertical: Andy owned every screen, several screens had no owner, Riley was overloaded, and Venue Intelligence was split across two owners. | Andy owns the shell, navigation, components, onboarding flow and event card. Riley and Ojas each build their own feature screens. Venue Intelligence moves entirely to Ojas, and the seam is a typed `RankedVenue[]`. Auth and profile go to Ojas. |
| 5 | Smart Match Ranking used an LLM on purely numeric (and at a hackathon, seeded) inputs, and its effect was invisible in the demo. | The deterministic score now builds the shortlist. Gemini re-ranks it with vibe, favorites, recency and local-time context, then writes a visible match reason. |
| 6 | The vibe table had gaps and overlaps, and it classified raw windows instead of hangout slots. | One template-based step now classifies the window *and* carves the slot. Priority order resolves overlaps, and unit test cases are listed below. |
| 7 | Group formation, consensus, timeout and anonymity weren't defined. | Groups are explicit groups, mutual close-friend pairs and maximal mutual cliques, with 2–6 members. Resolution uses plurality with a deterministic tie-break. Tallies stay hidden until close, and ghost passes count as "responded". |
| 8 | Gemini closure-risk ordering of backups used an LLM on a structured field. | Business status is filtered in code. Backups are the losing vote options, then the unused top-5 venues. The "It's closed" button stays. |
| 9 | The contract existed only as markdown, and migrations and the lockfile would collide across six agents. | `packages/contract` holds zod schemas that both apps import, and CI runs typecheck and tests on every PR. There is one schema steward and a CODEOWNERS lane map. Scaffolding is budgeted at 2.5 hours. |
| 10 | The demo depended on the venue wifi and live APIs, and push notifications need a dev build. | The backend is deployed by hour 6, with a hotspot as backup. `DEMO_MODE` replays recorded API responses, a reset script restores state, a recording is the last resort, and notifications use in-app sockets. |

## Team & Ownership

Each person owns their slice all the way through: backend, screens and
tests.

| Owner | Slice | Backend | Screens / client |
| --- | --- | --- | --- |
| **Riley** | Availability, matching, venues, mobility | `busy_blocks` sync, free-window math, group formation, vibe/slot, ranking, Places fetch and filter, `computeRouteMatrix` ranking, matcher worker, `report-closed`, seed script | Calendar permission step and client busy-block module, "It's closed" button logic (inside Andy's card) |
| **Ojas** | Identity, social graph, decision | Auth/profile, `friendships` handshake, seeded `explicit_groups`, **Venue Intelligence (Gemini)**, voting, Ghost Pass, resolution state machine, Socket.io server, expenses (stretch) | Sign-up and login forms, friend search/add screen, vote and Ghost Pass actions (hooks in `src/features/voting/`, consumed by the card), expenses screen (stretch) |
| **Andy** | App shell, onboarding, event card, demo | `PUT /favorites`, `GET /events`, `GET /events/:id` payload assembly | Expo Router shell, navigation, design system and components, onboarding flow container (sequences Ojas's and Riley's steps), favorites screen, event card in every state, socket client hook, demo runbook and reset script |

**Schema steward: Ojas.** Only the steward edits `prisma/schema.prisma` or
runs `db:push` (there are no migrations on MongoDB). Anyone else who needs a change opens an issue
labeled `schema`.

**Contract owners: all three.** A PR that touches `packages/contract`
needs a one-line approval from each of the other two.

**Handoffs between slices (all defined as types in `packages/contract`):**
- Riley's matcher calls Ojas's `curateVenues(RankedVenue[], ctx)` and
  gets back `EventOption[3]`.
- Riley's matcher then writes the event, its options and participants in
  one transaction, and calls Ojas's `openVoting(eventId)`, which emits
  `event:created`.
- Andy consumes `EventCardPayload` from `GET /events/:id`.

## Stack & Repo Layout

- **Mobile:** React Native with Expo and Expo Router. Use Expo Go on the demo
  iPhones. SDK 57 includes `expo-calendar/legacy` in Expo Go; the class-based
  `expo-calendar` API requires a development build.
- **Server:** Node, Express and TypeScript, with Socket.io. The matcher
  runs in-process on `node-cron`, so there is a single deployable.
- **Database:** MongoDB Atlas (shared free M0 cluster, AWS us-east-1)
  through Prisma 6. Server hosting is DigitalOcean App Platform (a
  long-running web service, not serverless), because Socket.io, the voting sweep and the
  cron matcher all need a process that stays up.
- **Monorepo:** pnpm workspaces with `node-linker=hoisted` in `.npmrc` (for
  Metro compatibility).

```
web/
  AGENTS.md  CLAUDE.md  GEMINI.md  CODEOWNERS
  wiki/
  packages/contract/        # zod schemas, inferred types, route paths, socket event names
  apps/server/
    prisma/schema.prisma    # schema steward only
    scripts/seed.ts  scripts/demo-reset.ts
    fixtures/               # DEMO_MODE recorded API responses
    src/modules/
      auth/ friends/ groups/            # Ojas
      calendar/ matching/ venues/       # Riley
      intelligence/ voting/ expenses/   # Ojas
      events/ favorites/                # Andy
    src/realtime/           # Socket.io server (Ojas)
  apps/mobile/
    src/app/(onboarding)/ src/app/(main)/  # Andy (shell, routes)
    src/lib/                            # Andy (API client, socket hook)
    src/features/calendar/              # Riley
    src/features/auth/ friends/ voting/ # Ojas (voting = vote/Ghost Pass hooks)
    src/features/favorites/ event-card/ # Andy
    src/ui/                             # Andy (shared components)
```

## Schema v3 (MongoDB Atlas)

> **2026-09-26: switched to MongoDB Atlas** (the MongoDB sponsor challenge
> requires Atlas as the database). The source of truth for the schema is now
> `apps/server/prisma/schema.prisma`. The SQL-style listing below is the
> original v2 design; the fields are the same, but ids are string UUIDs in
> `_id`, lat/lng are `Float`, and the CHECK and partial unique index are
> enforced in code (see [`invariants.md`](invariants.md)).


All timestamps are `timestamptz`, and every time comparison happens on
instants. Local time is used only for vibe classification and display.

```
users
  id uuid pk, username text unique, email text unique, password_hash text,
  timezone text            -- IANA, e.g. America/New_York
  home_lat numeric(8,3), home_lng numeric(8,3)   -- rounded, ~110 m
  travel_mode text default 'DRIVE'
  created_at
  email_verified_at null     -- null = unverified; sign-up writes null, seed/legacy accounts are backfilled as verified
  display_name null (1–40), bio null (≤ 160), username_changed_at null   -- #96; username changes once per 30 days
  pref_activities null (≤ 300), pref_personality null (≤ 300)   -- #310; private matching profile, owner + decision model only
  budget json null           -- #324; private, same rule. contract `Budget`: { <category>?: { spend: int 0–500 USD/person, often } }
                             --   categories coffee_snacks | casual_meal | nice_dinner | drinks_night_out | tickets_activities
                             --   often weekly | few_times_a_month | monthly | rarely

email_codes                -- one live code per (user, purpose); 6 digits, stored as HMAC-SHA256, never plain
  id, user_id fk, purpose ('verify'|'reset'|'change_email'), code_hash, new_email null,
  expires_at (10 min), attempts (max 5), created_at   -- 60 s resend cooldown
  index (user_id, purpose)

busy_blocks
  id, user_id fk, starts_at, ends_at, source ('device_calendar'|'google_calendar'|'seed'), synced_at
  index (user_id, starts_at)

google_calendar_connections
  id, user_id fk unique (cascade delete), refresh_token_enc text (AES-256-GCM ciphertext only),
  scopes text[], status enum(active, revoked, error) default 'active',
  connected_at default now(), last_synced_at null, last_error text null

friendships                -- exactly one row per pair
  id, user_low_id, user_high_id          -- CHECK user_low_id < user_high_id, unique pair
  status ('pending'|'accepted') default 'accepted'   -- visible friend-request layer
  requested_by_id null, requested_at, accepted_at null
  declined_at null           -- soft decline: hidden from the recipient, still pending to the requester
  low_added_high bool default false, high_added_low bool default false
  -- close-friend flags (silent layer): only ever true when status = 'accepted'
  -- mutual = low_added_high AND high_added_low, computed in queries
  -- (Prisma can't model generated columns; don't hand-write one)
  interaction_score real default 0.5     -- 0..1, seeded for demo
  last_hangout_at timestamptz null

explicit_groups (id, name, created_by)            -- Squads (#76); seeded groups predate them
group_members   (group_id, user_id, role)  pk(group_id, user_id)
  status ('invited'|'active') default 'active', invited_by_id null, invited_at null,
  accepted_at null           -- said yes; still 'invited' until the 24 h objection window passes

user_favorites
  id, user_id, category text, venue_name text null, google_place_id text null

events
  id uuid, group_key text          -- sorted member ids joined, for cooldown/dedupe
  source_group_id uuid null        -- set if formed from an explicit group
  created_by_id text null
  status enum(voting, confirmed, chatted, expired, completed)
  starts_at, ends_at, vibe_tag enum(quick_coffee, casual_hangout, dinner, night_out)
  timezone text                    -- timezone of member closest to venue centroid
  venue_place_id, venue_name, venue_lat, venue_lng   -- null until confirmed
  venue_status enum(open, reported_closed) default 'open'
  venue_snapshot jsonb null        -- full EventOption of the current venue; the swap copies backup_venues[0] here
  backup_venues jsonb default '[]' -- ordered array of EventOption snapshots
  vote_closes_at, created_at, resolved_at
  match_reason text null          -- one-line group/time explanation; null for deterministic fallback
  UNIQUE (group_key) WHERE status IN ('voting','confirmed')   -- raw SQL in migration

event_participants
  event_id, user_id, vote_status enum(invited, voted, ghost_passed, confirmed)
  pk(event_id, user_id)

event_options                      -- the 3 vote choices
  id, event_id, rank int, place_id, name, lat, lng, primary_type,
  price_level int, rating real, user_rating_count int,
  travel_minutes jsonb             -- { "<user_id>": 12, ... }
  max_travel_min int, route_score real,
  facts_line text                  -- deterministic: "★4.6 · $$ · max 14 min travel"
  ai_blurb text null               -- Gemini; null if fallback
  activity text null               -- "Bouldering" (≤ 40 chars); null = the event's vibe_tag (#321)
  starts_at, ends_at null          -- the option's own time; null = the event's. The winner's becomes the event's

votes                              -- never exposed per-user via API or socket
  event_id, user_id, option_id, cast_at   pk(event_id, user_id)

expenses        (stretch)  id, event_id, paid_by, total_cents int, description, created_at
expense_splits  (stretch)  id, expense_id, user_id, amount_owed_cents int, settled bool
```

**Equal-split rounding rule:** split the total evenly, then give the
leftover cents one each to the first participants in the list. For
example, $10.00 split three ways gives 334 / 333 / 333 cents.

## API Contract v2 (`/api/v1`, bodies defined in `packages/contract`)

Every route except signup and login requires `Authorization: Bearer <JWT>`.

| Method | Path | Owner | Purpose |
| --- | --- | --- | --- |
| POST | /auth/signup | Ojas | Create user, return JWT |
| POST | /auth/login | Ojas | Return JWT |
| POST | /auth/verify-email/send | Ojas | Email a new 6-digit code. 204, or 429 + `Retry-After` within 60 s, or 409 if already verified |
| POST | /auth/verify-email | Ojas | `{ code }` → `Me`. `400 wrong_code` burns an attempt; `400 code_expired` means send a new one |
| GET / PATCH | /me | Ojas | Profile: timezone, home_lat/lng, travel_mode, `display_name`, `bio`, `pref_activities` / `pref_personality` (private, ≤ 300, #310), `budget` (private, #324; `null` clears it), `username` (once per 30 days; 409 `username_taken` / `username_cooldown`), `email_verified` (read-only) |
| POST | /me/email | Ojas | `{ new_email, password }` → emails a code to the new address (409 if taken) |
| POST | /me/email/confirm | Ojas | `{ code }` → switches the email, marks it verified, tells the old address → `Me` |
| GET | /users/:id | Ojas | Public profile: `{ id, username, display_name, bio, friendship: none\|requested\|incoming\|friends, squads }` (shared active squads). Never email or close-friend status |
| PUT | /busy-blocks | Riley | Replace the caller's blocks inside `[horizon_start, horizon_end]` in one transaction |
| GET | /users/search?q= | Ojas | Username search. Never reveals whether they added you |
| GET | /squads | Ojas | Squads I'm in or invited to: `{ id, name, my_status, members: [{ id, username, status, joins_at }] }` |
| POST | /squads | Ojas | `{ name, invitee_ids }`. Creator is active; invitees (1–5, my accepted friends) are invited |
| POST | /squads/:id/invite | Ojas | `{ invitee_ids }`. Active members only; at most 6 people counting invites |
| DELETE | /squads/:id/invites/:userId | Ojas | An active member objects to a pending invite (removes it) |
| POST | /squads/:id/respond | Ojas | `{ accept }` from the invitee. Decline removes the invite |
| POST | /squads/:id/leave | Ojas | The last active member out deletes the squad |
| PATCH | /squads/:id | Ojas | `{ name }`, active members only |
| POST | /friends/requests | Ojas | `{ username }` → `{ status: "requested" \| "friends" }`. If they already requested me, this accepts. Max 50 pending outgoing |
| GET | /friends/requests | Ojas | `{ incoming, outgoing }` pending requests. A declined request stays in the requester's outgoing list |
| POST | /friends/requests/:id/accept | Ojas | Recipient accepts |
| DELETE | /friends/requests/:id | Ojas | Recipient declines (silently) or requester cancels |
| GET | /friends | Ojas | Accepted friends, each with `close` = **my** flag only |
| DELETE | /friends/:userId | Ojas | Unfriend. Deletes the pair, clearing both close-friend flags |
| GET | /friends/close | Ojas | My close friends. Never says whether they chose me back |
| POST | /friends/close | Ojas | `{ username }` sets my direction; 409 unless we're accepted friends. If it becomes mutual, triggers the matcher for affected groups |
| DELETE | /friends/close/:userId | Ojas | Clear my direction silently; 409 unless we're accepted friends |
| PUT | /favorites | Andy | `{ categories: string[] }` |
| GET | /events | Andy | My open and recent events, each card scoped to me (§9 "Who sees what") |
| GET | /events/:id | Andy | `EventCardPayload`: options, facts, blurbs, progress, outcome, `viewer`. Each option may carry `activity`, `starts_at` and `ends_at` (optional; absent = the event's vibe and time, #321). Scoped to the caller (§9 "Who sees what"). Never includes voter identities |
| POST | /events/:id/vote | Ojas | `{ option_id }`. Can be changed until voting closes |
| POST | /events/:id/ghost-pass | Ojas | Quietly opt out |
| POST | /events/:id/invite | Andy | `{ invitee_ids }` (1–5 accepted friends). Any participant who hasn't passed, while voting or confirmed and before the start; not Mixers. Invitees join as direct invites. 204, also when someone was already in (hides direct invitees) (#345) |
| POST | /events/:id/decline | Andy | A direct invitee still at `invited` bows out of a confirmed hangout before it starts (a Ghost Pass) (#345) |
| POST | /events/:id/report-closed | Riley | `{ current_place_id }`. Returns 409 if someone already swapped |
| POST | /internal/run-matcher | Riley | Requires header `X-Internal-Secret`. Used for the demo and debugging |
| POST / GET | /events/:id/expenses | Ojas | Stretch |
| PATCH | /expense-splits/:id | Ojas | Stretch: `{ settled }` |

**Socket.io (Ojas server, Andy client).** The client authenticates with
the JWT in the handshake and the server joins it to `user:{id}`. Socket
payloads are deliberately thin: on any event, the client refetches
`GET /events/:id`. That keeps a single payload shape.

| Event | Payload |
| --- | --- |
| `event:created` | `{ event_id }` |
| `event:progress` | `{ event_id, responded, total }` |
| `event:resolved` | `{ event_id, status }` |
| `event:venue_changed` | `{ event_id }` |
| `friend:request` | `{ user_id }` (to the recipient; refetch `GET /friends/requests`) |
| `friend:accepted` | `{ user_id }` (to the requester; refetch `GET /friends`) |

## The Pipeline, End to End

### 1. Busy-block sync (Riley, client + server)

- The client reads every calendar through `expo-calendar` for the
  window `[now, now + 7 days]`.
- It skips all-day events (birthdays and holidays) and events whose
  `availability` is `free`.
- Each remaining event becomes a `{starts_at, ends_at}` block. Titles,
  notes and attendees are never read into the payload.
- The client sends `PUT /busy-blocks` during onboarding and whenever the
  app comes to the foreground, if the last sync was more than 15 minutes
  ago.
- Demo phones B and C never grant calendar permission, so their seeded
  blocks stay untouched.

### 2. Candidate groups (Riley)

**Automated proposals use whole squads, Mixers and close-friend 1-on-1s
(#320, #215, #404).** `runPipeline` keeps the explicit-group candidates
whose members are exactly the squad's active members (3–6), Riley's
anonymous Mixers (`mixerCandidates`, 4–6 mutual friends within two hops),
and mutual close-friend pairs (both starred, friendship accepted). Priority
is squads, then Mixers, then pairs, and `onePairPerPerson()` gives each
person at most one new proposal per run, so a squad of close friends still
gets one squad card. Cliques and one-drop subsets stay in
`candidateGroups()` but are filtered out there. Manual hangouts
(`createUserHangout`) don't use this step.

A candidate group has 2–6 members and comes from one of four sources:
- **Explicit groups:** every member of each explicit group.
- **Mutual pairs:** each mutual close-friend edge. One-sided adds never
  become suggestions.
- **Mutual cliques:** each maximal clique in the mutual close-friend
  graph (Bron–Kerbosch, trivial at demo scale).
- **Quorum subsets:** for any group with 4 or more members, each subset
  with one member dropped.

Groups are deduplicated by `group_key`. Members may span timezones; each
candidate retains every member's IANA timezone.

**Cooldown:** a `group_key` isn't re-proposed within `COOLDOWN_HOURS`
after an event for it ends as `expired` or `chatted`.

### 3. Free windows (Riley, pure functions)

1. For each member, pad every busy block by 15 minutes on each side.
2. Add the slot of every open event (`voting` or `confirmed`) the member
   belongs to. This prevents double-booking.
3. Free = each member's waking hours (08:00–24:00 in their local time)
   minus the merged busy set, within `[now + 2h, now + 7d]`.
4. The group's free windows are the intersection across all members.

### 4. Vibe tag + slot (Riley, pure function, one step)

Each vibe has a template, and templates are evaluated in every member's
local time. A slot is feasible only when its start and duration fit the
same template for every member. Priority uses the weekday in the timezone
whose local wall clock is earliest at the start of the free window.

| vibe_tag | Duration (min–max) | Allowed start (local) | Places types (verify vs. Places New Table A) | Price |
| --- | --- | --- | --- | --- |
| quick_coffee | 45–60 min | 08:00–16:30 | cafe, coffee_shop | 1–2 |
| casual_hangout | 60–120 min | 10:00–20:30 | cafe, bakery, restaurant | 1–2 |
| dinner | 90–120 min | 17:30–20:00 | restaurant | 2–3 |
| night_out | 120–180 min | 20:00–22:00 (Fri/Sat from 19:00) | bar, night_club, bowling_alley | 2–4 |

**How a window becomes a slot.** Let W be a free window.

- For each template:
  - Set `s` = the latest of W.start and the template's earliest start in
    every member's local timezone, rounded up to the next 15 minutes.
  - Set `len` = the smaller of the template's max duration and
    W.end − s.
  - The template is feasible if `s` is no later than its latest start in
    every member's timezone and `len` is at least its minimum duration.
- Among feasible templates, choose by priority:
  - **Fri/Sat:** night_out > dinner > casual_hangout > quick_coffee
  - **Sun–Thu:** dinner > night_out > casual_hangout > quick_coffee
- The slot is `[s, s + len]`. If nothing is feasible, discard W.
- `feasibleSlots` lists every feasible template; `classifySlot` is that
  plus the priority pick (#229). The scheduler uses the priority pick;
  since #311 its activities come from preference fit (§6), not a vibe
  question.
- The weekday is taken from the member timezone whose local wall clock is
  earliest at W.start.
- Every template's latest start + minimum duration ends by 24:00, so no
  template can be cut off by the waking-hours limit.

**Required unit tests** (dates in the local timezone):

| Free window | Expected |
| --- | --- |
| Tue 18:00–19:15 (75 min) | casual_hangout 18:00–19:15 |
| Sat 13:00–16:00 | casual_hangout 13:00–15:00 |
| Sat 12:00–18:00 (6 h) | casual_hangout 12:00–14:00 (slot carved, not 6 h) |
| Tue 19:00–22:00 | dinner 19:00–21:00 |
| Wed 20:30–23:00 | night_out 20:30–23:00 (dinner's latest start is 20:00) |
| Fri 19:00–23:00 | night_out 19:00–22:00 |
| Thu 14:00–14:45 | quick_coffee 14:00–14:45 |
| Thu 14:00–14:40 (40 min) | discarded |
| Tue 22:10–23:59 | discarded (after every latest start) |
| Tue 17:10–19:00 | dinner 17:30–19:00 |

### 5. Ranking (Riley, deterministic shortlist + decision-model gate)

Each (group, slot) candidate gets a score:

```
score = 0.6 · staleness   (min(days since last hangout, 14) / 14; never = 1)
      + 0.4 · soonness    (1 − hours_until_start / 168)
```

Candidates are whole squads (3+ members), so there is no pair size factor.

**Closeness is deferred (#320).** The score used to be
`0.40 · closeness + 0.35 · staleness + 0.25 · soonness`, with a 0.85
factor for pairs. Closeness was the mean `interaction_score` over member
pairs (a missing pair counted as 0), plus 0.05 for a group from an
explicit group, so a squad beat an identical ad-hoc clique. It's off
because the scheduler proposes to squads only, so the squad bonus no
longer separates anything, and `interaction_score` history is too sparse
to rank one squad above another. To turn it back on, restore the
closeness term in `rankCandidates` (`matching/candidates.ts`) with those
weights; `friendships.interaction_score` is still stored.

Ties go to the earlier start, then to `group_key` in lexical order. This
deterministic score builds a top-10 shortlist.

The hard limits apply first: one open proposal per group, and the
`COOLDOWN_HOURS` (48) cooldown.

**Decision gate (#231).** One `askDecision` call (Jev)
per shortlisted candidate, in parallel, built by `groupRequest` in the same
format as Laya's training data (#235). The question carries plain-word facts
(size, "Fri 7:00pm", "Last hangout: 3 weeks ago", shared favorites; no
names, no raw timestamps):
- `propose`: a 2-option Choice, `A` = suggest a hangout now, `B` = not
  now. Keep the candidate when P(`A`) ≥ 0.6.

The automated flow no longer asks the group `vibe` question (#311): the
slot stays the priority pick, and preference fit (§6) chooses the
activities, each at its own time. A forced run (the demo button) skips the
gate. If any decision call fails, only the top-ranked candidate is
proposed. `rankWithGemini` is removed; `match_reason` now comes from §8.

Candidates are processed greedily after the gate. A candidate
is skipped if its group already has an open event, or if any member already
belongs to an open event whose slot overlaps.

### 6. Venue candidates (Riley)

**Automated scheduler: nearby activities, no fixed list (#322).** For a
squad proposal, the options are activity + place + their own time, found
near the squad instead of drawn from the vibe's place types
(`venues/discover.ts`, `intelligence/activities.ts`):

1. **Discover (code).** One Places Nearby Search (New) around the
   squad's home centroid, radius 5 km, `maxResultCount` 20, with
   `LEISURE_TYPES`: 46 Table A types across food, drink, entertainment,
   sports, outdoors and culture (the limit is 50 per request). Field
   mask: `places.id, places.displayName, places.location,
   places.primaryType, places.businessStatus, places.timeZone,
   places.regularOpeningHours, places.rating, places.userRatingCount,
   places.priceLevel`. `regularOpeningHours` makes it a Nearby Search
   Enterprise request; rating, rating count and price are the same SKU,
   and the rest are Pro, so none of them costs extra.
2. **Filter (code).** Keep `OPERATIONAL` places that are open for at
   least 45 minutes between the slot start and the end of the free
   window. Opening-hours periods are read in the place's own
   `timeZone` and turned into UTC instants; missing hours or a period
   with no close count as open.
3. **Rank (code).** The route matrix from §7, keeping the 15 best by
   `route_score`.
4. **Describe (Gemini, text only).** One call per squad returns, for
   each place ID, an `activity` label (40 characters or fewer, like
   "Bouldering"), `typical_minutes` (30–240) and a `spend_category`
   (one of the 5 budget categories, #324). Zod validates each entry:
   unknown IDs are dropped, and an invalid entry falls back to a label
   from `primary_type` and 90 minutes. A missing or invalid
   `spend_category` alone falls back to `spendCategoryFor(primary_type)`
   (restaurant → casual meal, bar/pub/night club → drinks, cafe/bakery →
   coffee & snacks, anything else → tickets & activities). A failed call
   falls back for every place.
5. **Time (code).** Each option starts at the first 15-minute mark when
   the place is open, never before the event's slot start (the voting
   deadline is derived from it) and at least `MIN_LEAD_HOURS` out. It
   lasts `typical_minutes` and ends inside both the free window and the
   opening hours. Places where it doesn't fit are dropped.
   Then the **price cap (code, #324)**: `withinBudget` estimates $ per person
   from `price_level` ($ 15, $$ 30, $$$ 60, $$$$ 100; none = no cap)
   and drops a candidate above 1.25 × the **lowest** `spend` any squad
   member set for its `spend_category`. Members who didn't set that
   category don't count; nobody set it → no cap. Dropped places aren't
   backups either. How often is a model input only.
6. **Preference fit (decision model per member, #311).** One
   `askDecision(memberFitRequest(profile, candidates))` per squad member,
   in parallel. `state` is that member's private `pref_activities` and
   `pref_personality` (each capped at 300 characters, framed as data,
   never instructions) plus their favorite categories, with no name,
   username or id; an empty profile sends "No profile yet". Their
   `budget` goes in as plain-word lines ("Nice dinner: about $60, about
   once a month"), or "No budget set" (#324). The one
   question, `fit`, is a Choice over the ≤ 15 candidates keyed `c0…cN`,
   each in plain words ("Bouldering at Movement: climbing gym, $$, ★4.7,
   ~2h"): no place IDs, raw times or commutes.
7. **Pick 3 (code).** `pickByPreference`: a candidate's score is the
   **sum** of the members' probabilities; take the top 3 with distinct
   activity labels (case-insensitive), topping up from the next best.
   `squadAppeal` is the mean member probability of the #1 pick.
   **Gate:** propose only when the §5 `propose` P(`A`) ≥ 0.6 **and**
   `squadAppeal` ≥ 0.2; the demo button's `force` skips both but still
   uses this pick. **Fallback:** if any member call fails,
   `pickActivities` takes the 3 best by `route_score` with distinct
   labels. §8's Gemini text step writes the blurbs; it never sees the
   profiles, and there's no venue-fit decision in the automated flow.

If fewer than 3 distinct activities come out, or discovery fails, the
scheduler falls back to the fixed-vibe venues below and takes the 3 best
by `route_score` (no venue fit). Manual New hangout always uses the fixed
vibes and §8's venue fit.

**Fixed-vibe venues (manual New hangout, and the scheduler's fallback):**

- Call Places API (New) Nearby Search centered on the centroid of the
  participants' home locations.
  - Radius is 4 km, widening to 8 km if fewer than 5 venues survive
    filtering.
  - Use the vibe's `includedTypes`, with `maxResultCount` 20.
  - Field mask (the `places.` prefix is required): `places.id,
    places.displayName, places.location, places.primaryType,
    places.priceLevel, places.rating, places.userRatingCount,
    places.businessStatus, places.regularOpeningHours`.
  - `priceLevel` comes back as an enum string (`PRICE_LEVEL_MODERATE`
    etc.). Map it to 1–4 in one helper; a missing price passes the
    filter.
- Filter in code, in this order:
  1. Keep only venues with `businessStatus == OPERATIONAL`.
  2. The venue must be open for the whole slot. Skip this check if its
     hours are missing.
  3. The price level must be within the vibe's range.
  4. Rating must be at least 4.0 with at least 30 ratings. Relax this
     step if fewer than 5 venues remain.
- Pre-sort by rating, adding +0.3 when the venue's category matches a
  group favorite. Keep the top 10.

### 7. Meetup ranking — the Mobility angle (Riley, deterministic)

- Call Routes API `computeRouteMatrix` with the members' home locations
  as origins and the 10 candidates as destinations. That's at most
  6 × 10 = 60 elements.
- Use `travelMode` DRIVE by default with `routingPreference`
  TRAFFIC_AWARE, and `departureTime` set 30 minutes before the slot
  starts.
- **Every request needs the `X-Goog-FieldMask` header.**
- Drop any candidate that someone can't reach.
- Compute `route_score = max_minutes + 0.1 × sum_minutes`, where lower is
  better, and keep the top 5 as `RankedVenue[]`.
- Why this cost function beats a plain sum:
  - A venue with commutes of 5, 5 and 50 minutes scores 50 + 6 = **56**.
  - A venue with 20, 20 and 20 scores 20 + 6 = **26**, so it wins.
  - A plain sum would call them a tie at 60.
- Pitch line: "We optimize for the worst commute, not the average one.
  Nobody gets stuck with the 50-minute trip."

### 8. Venue Intelligence (Ojas; decision-model fit filter + Gemini text)

**Called as** `curateVenues(RankedVenue[], context) → EventOption[3]`.
The automated flow (§6, #322, #311) calls `curateActivities(picks,
context)` instead: code has already picked the 3, so there's no fit
filter, and the same Gemini text step writes the blurbs, keeping each
option's `activity`, `starts_at` and `ends_at`.

**Input:**
- The top 5 venues, each with its structured fields, max and total travel
  time, and up to 3 review snippets (200 characters or fewer each).
- Review snippets come from 5 Place Details calls, one per venue, so the
  more expensive review field is never requested in search.
- Context: the vibe tag, the slot's local time, and counts of the group's
  favorite categories.

**Fit filter (#230):** one `askDecision` call per venue, in parallel,
built by `venueFitRequest` in the Laya training format (#235): `venue_fit`,
a 2-option Choice (`A` fits the vibe / `B` doesn't) that sees
only the name, primary type and review snippets. It catches reviews that
contradict the vibe, for example a steakhouse tagged casual. Code keeps
the venues where P(`A`) ≥ 0.5, takes the top 3 by `route_score`, and tops
up from the rest if fewer than 3 fit.

**Text:** one Flash-tier Gemini call with a JSON `responseSchema` writes
the 3 blurbs and the card's `match_reason` (90 characters or fewer each),
using only facts from the input. The place IDs must match the 3 chosen
venues.

**Fallback:** if any decision call fails, use the top 3 by `route_score`.
If Gemini fails or misses `GEMINI_TIMEOUT_MS` (8 seconds), `ai_blurb` and
`match_reason` are null. The card always shows the deterministic
`facts_line`, so it never looks broken. Both callers (the matcher and
manual New hangout) always get exactly 3 options.

**Cache:** results are cached by vibe plus the sorted place IDs.

### 9. Voting (Ojas)

- **Opening:** the event is created with status `voting`. Set
  `vote_closes_at` to whichever comes first: creation + `VOTE_TIMEOUT_SEC`,
  or 2 hours before the slot starts.
- **Casting:** each participant either votes for one option or passes
  (`POST /events/:id/ghost-pass`; a Ghost Pass or a visible Pass depending
  on how they were invited, see "Pass lifecycle" below). Either response
  can replace the other until voting closes.
- **Anonymity:**
  - The API and sockets never expose who voted for what.
  - Tallies stay hidden until voting closes.
  - Progress shows "responded / total", and **a ghost pass counts as
    responded**, so it looks exactly like a vote.
  - Once confirmed, each person sees only the attendees they're allowed
    to see (below), so a direct invitee's Ghost Pass can only be inferred
    by the hangout's human creator. This supersedes the original shared
    attendee list, where a ghost-passer's absence was visible to everyone.
- **Closing:** voting closes early once everyone has responded, and
  otherwise at `vote_closes_at`. A sweep runs every 15 seconds. After
  close every response is final.

### Who sees what (#206)

How each person got in (`invite_source`) is stored per participant for mixed
events. Older events still derive it from the event's `created_by_id` and
`source_group_id` (`inviteSource()` in `invitations.ts`):

- **`creator`**: the participant who is the event's `created_by_id`.
  Automated hangouts have no creator and no creator view.
- **`squad`**: everyone else in an event with a `source_group_id` (today,
  an automated squad proposal).
- **`direct`**: everyone else: people picked for a user-made hangout, and
  automated proposals outside a squad (none since #320; later Mixers
  #215/#220).

Mixed events store all selected squad IDs in `events.source_group_ids` and
each participant's invitation source and contributing squad IDs in
`event_participants`. A person selected directly and through a squad has
one participant row with squad rules. The legacy `source_group_id` remains
for older events and automated single-squad proposals. A mixed event's
member sees peers from shared selected squads only; a direct guest sees
only themselves and the creator.

A mixed event gets one chat room only when all squad invitees share a
selected squad. Otherwise chat stays closed: a shared room would reveal
people from separate squads who cannot see each other on the card.

Pass kind follows the source: a direct invite's pass is a **Ghost Pass**
(looks exactly like a vote, never shown to anyone); the creator's and a
squad member's pass is a **visible Pass** ("can't make it"). What each
viewer gets on the card, list, and any future chat membership or presence
(all computed by one pure function, `viewerScope()` in
`apps/server/src/modules/events/invitations.ts`):

| Viewer | Sees these people | Sees these passes | Tallies after close |
| --- | --- | --- | --- |
| Human creator | Everyone (`viewer.full_roster`) | Visible passes; attendees after close, so they alone can infer a Ghost Pass | Yes |
| Squad member | Themselves, the creator, and members of selected squads they share | Those people's visible passes | Only if they can see everyone |
| Direct invitee | Themselves and the creator | The creator's visible pass | Only if they can see everyone |
| Anyone, automated hangout | As above, with no creator | As above | As above |

- `participants`, `outcome.attendees` and every option's
  `travel_minutes` hold only people the viewer may see; `passed` is null
  where the viewer may not see it (never "didn't pass").
- `progress` stays `responded / total` for everyone (a Ghost Pass counts
  as responded). Mixers hide the total later (#220).
- Socket payloads name no people (`{ event_id }`, counts, status); each
  client refetches its own scoped card. Chat messages show only their own
  poster; there are no membership, presence or system messages.
- **Event chat (#212).** Who is in an event's chat comes from one pure
  rule, `chatAudience()` in `invitations.ts`, built on `eventAudience()`;
  the chat routes, `event:message` recipients and the card's
  `viewer.chat` (`open` / `read_only` / null) all use it. A chat shows
  every poster to every member, so its members must all be allowed to see
  each other:
  - **Squad hangouts** (any squad invitee) get chat from creation, while
    voting, after confirmation and as `chatted`, for the creator and the
    squad. Their passes are visible, so a squad Pass keeps chat. Direct
    invitees in a mixed hangout are never in it: they may only see
    themselves and the creator, and squad members may not see them.
  - **Every other event** (direct-only, automated close-friend) has chat
    only as the `chatted` fallback, for everyone who keeps access after
    close, as before.
  - A Ghost Pass never enters chat, even while voting is open. Posting
    stops at `ends_at` (read-only after, until cleanup 7 days later); an
    `expired` event has no chat. Anyone outside the chat gets the same
    403, whether or not the event has one.
- **Honest limit:** the outcome itself can't be hidden. If a small
  hangout expires because people passed, the remaining guests learn it
  isn't happening, which can imply who passed. The card never names
  anyone.

### Pass lifecycle (#210)

Every pass is stored as `vote_status = ghost_passed`; its kind comes from
the invite source (`passKind()`), so a squad Pass has no status of its
own. The card shows the viewer's kind as `viewer.pass_kind`.

| | Ghost Pass (direct invite) | Visible Pass (creator or squad) |
| --- | --- | --- |
| While voting is open | Counts as responded; can be replaced by a vote. Keeps the card and every update, exactly like a voter | Same |
| After close (everyone responded, or the deadline) | Final. The event disappears: 404 on `GET /events/:id`, left out of `GET /events`, 403 on chat, and no more socket events or pushes | Final. Keeps the card, chat (normal time limits) and updates, and isn't an attendee |

- One pure rule decides it: `keepsAccess(row, votingOpen)` in
  `apps/server/src/modules/events/invitations.ts`, with `votingOpen()` in
  `voting/resolution.ts`. Chat always applies the after-close rule, so a
  Ghost Pass never enters chat (`chatAudience()`, #212).
- Every post-close audience (event list/detail, `event:resolved`, the
  resolved push, chat and `event:message`) goes through `keepsAccess()` /
  `eventAudience()`. Voting, chat and realtime read invite source only
  through `eventParticipants()`, so moving where it's stored changes one
  place.
- The venue swap (§11, Riley's `venues/router.ts`) sends `event:venue_changed`
  and its push to `eventAudience(…, false)`, and verifies `canSeeEvent()` /
  `keepsAccess()` for the caller and its 409 card (#333).
- Before close, progress, notifications and the card look the same for a
  Ghost Pass and a vote; others can't observe the ghost passer losing the
  event afterwards.

### 10. Resolution (Ojas)

- **Fewer than 2 people remain after ghost passes:** the event becomes
  `expired`.
- **At least 2 people remain and at least 2 votes were cast:** the event
  becomes `confirmed`.
  - The option with the most votes wins. A tie goes to the lower
    `route_score`.
  - The venue fields are locked in, and voters' status becomes
    `confirmed`.
  - If the winning option has its own `starts_at`/`ends_at` (#321), the
    event's `starts_at`/`ends_at` become them. Options without a time
    leave the event's time unchanged.
  - `backup_venues` = the losing options (most votes first, then by
    route_score), followed by the unused top-5 venues.
- **At least 2 people remain but fewer than 2 votes:** the event becomes
  `chatted`. The card shows the window and who's free (only people the
  viewer may see, §9), plus a
  "Plan it yourselves" button that opens the OS share sheet with a
  prefilled message. This replaces the fallback chat.
- **After the slot ends,** a `confirmed` event becomes `completed`.

### 11. "It's closed" (Riley backend, Andy UI)

- **When it's allowed:** the event is `confirmed`, and the current time
  is between `REPORT_CLOSED_WINDOW_HOURS` before the slot starts and the
  slot's end. The demo event is days away, so the demo config opens the
  window to the full week.
- **The request** includes `current_place_id`. If that no longer matches
  the event's venue, the server returns 409 with the current event. This
  handles two people tapping at once.
- **The swap:** the venue (including `venue_snapshot`) becomes `backup_venues[0]`, the list shifts,
  and `venue_status` is set back to `open` for the new venue. Then the
  server emits `event:venue_changed`.
- **No backups left:** the event becomes `chatted`.
- **The time stays:** a swap never changes the event's resolved
  `starts_at`/`ends_at`, even when the backup option had its own time
  (#321).
- **No new external API calls.** Travel times for the backup are already
  stored in its snapshot.
- **Honest limit:** the app can't verify real-world status. The human tap
  is the fix, and the precomputed backup list is what makes it instant.

### 12. Expenses (Ojas, stretch)

`POST /events/:id/expenses` takes an equal split over the confirmed
attendees, using the cent-rounding rule above. The "settled" toggle is
manual.

### Matcher triggers

- node-cron weekly, Monday 09:00 America/New_York (#232)
- `POST /scheduler/run`, logged in as an operator (`OPERATOR_USERNAMES`,
  #403; anyone else gets `403 forbidden`), behind the **Find a hangout now**
  demo button (#232/#233), which only operators see (`Me.is_operator`). It replies `202` and runs a forced
  `triggerMatcher({ force: true })` in the background.
- `POST /internal/run-matcher`

The old 5-minute cron and the event triggers (mutual handshake,
`PUT /busy-blocks`, Google sync) were removed in #197 and stay off. Every
trigger goes through one in-process mutex, so a cron tick and a button tap
can't race. The partial unique index on `events.group_key` is the
backstop if they ever do.

## Where AI Is and Isn't Used

**Deterministic code:** busy-to-free math, group formation, vibe and slot,
shortlist scoring, place discovery and filtering (including opening
hours), route-matrix scoring, each option's time, picking the 3 options,
and backup ordering. These form the complete fallback path. The automated
flow has no fixed activity list: code finds what's open nearby (§6).

**Decision model (`askDecision`, #228):** our fine-tuned, self-hosted Laya
(#274, when `LAYA_URL` is set), then Jev `jev-1.13.0`, then the
deterministic fallback. In the automated flow
it decides whether to propose to a group now (§5) and how much each
member would enjoy each discovered activity, from their private profile
(preference fit, §6, #311); code sums those into the 3 options. Manual
New hangout uses it to check which venues fit the vibe (§8). Code computes
every option it chooses from.
It also reads each event-chat message's intent (#325: can't make it,
running late, change spot, logistics, just chatting). When the top intent
is at least 0.75 and actionable, only the sender is offered Pass (while
they can still pass, #210), Change spot (while #214 allows it) or a
running-late hint. It runs in the background, sees only that message's
text, and nothing is stored.

**Gemini, text only:** the vote blurbs and the card's `match_reason` (§8),
and, in the automated flow, an activity label and typical length for each
discovered place (§6, #322). It also writes the synthetic training
scenarios (#235). It never makes a decision: code filters, times and
picks the options.

**Pitch note: teacher and student (next step, #274).** Gemini generates
scheduling scenarios and Jev labels them with calibrated probabilities (the
teacher). That training set is built (#235), and the runtime requests match
its format (#256). Laya is fine-tuned on it (the student) and served in
front of Jev (#274).

**Future work (pitch only):** learned ranking once real hangout history
exists, natural-language expense entry, and summaries of the fallback chat.

## Config (env)

| Var | Default | Demo |
| --- | --- | --- |
| VOTE_TIMEOUT_SEC | 43200 | 43200 |
| COOLDOWN_HOURS | 48 | 48 |
| MATCH_HORIZON_DAYS | 7 | 7 |
| MIN_LEAD_HOURS | 2 | 2 |
| BUSY_PADDING_MIN | 15 | 15 |
| GEMINI_TIMEOUT_MS | 8000 | 8000 |
| DECISION_TIMEOUT_MS | 8000 | 8000 |
| REPORT_CLOSED_WINDOW_HOURS | 24 | 168 |
| DEMO_MODE | false | true only if the network fails (replays `fixtures/`) |
| INTERNAL_SECRET | — | set |
| OPERATOR_USERNAMES | "ojas" | Andy's and Ojas's demo usernames, comma-separated (#403) |

## Workflow & Agent Rules (details in `wiki/workflow.md`)

- **Branches and worktrees:** every agent session starts from a GitHub
  Issue with acceptance criteria, and gets one branch named
  `<name>/<issue#>-<slug>`. A person's two agents run in separate git
  worktrees.
- **Stay in your lane:** agents edit only paths their owner holds in
  CODEOWNERS.
  - `packages/contract` changes need a `contract` label and approval from
    the other two owners.
  - `prisma/schema.prisma` is edited only by the schema steward.
  - Anyone else who needs a change files an issue.
- **Dependencies:** agents add packages only to their own app's
  `package.json`. Lockfile conflicts are resolved by rebasing on main and
  re-running `pnpm install`, never by merging the file by hand.
- **CI (GitHub Actions, set up in hour 0):** runs `tsc -b` across the
  workspace and the unit tests on every PR. Because both apps import the
  contract package, any drift from the contract fails the typecheck.
- **Merging:** self-merge is allowed when CI is green and the PR doesn't
  touch the contract or schema. Merge order is contract, then backend,
  then frontend. Unmerged endpoints are stubbed with the contract's types.
- **Git identity:** each teammate sets `user.name` and `user.email` to
  their own GitHub identity before their agents make a first commit.
- **Tracking:** GitHub Issues and a Projects board.

## Demo Operations

- **Hardware:** three physical phones. Phone A has a dedicated demo
  calendar account. Its only requirement is being free during the staged
  window.
- **Seed (`scripts/seed.ts`, Riley):**
  - Riley and Ojas are mutual in `friendships` (interaction 0.8, last
    hangout 10 days ago).
  - Riley and Ojas share the squad **Thursday crew**; the presenter joins
    it in demo step 5 (#320).
  - Their busy blocks cover the whole horizon except one window, computed
    relative to the seed date: the first Thursday at least 24 hours away,
    18:15–21:00 local. After the 15-minute padding that leaves
    18:30–20:45 free.
  - Result: the only possible match is a dinner, 18:30–20:30.
- **Reset (`scripts/demo-reset.ts`, Andy):** wipes events, the presenter
  account and the presenter's friendship edges, then re-seeds. Run it
  before every rehearsal.
- **Network:**
  - Deploy the backend by hour 6, and point the phones at the deployed
    URL.
  - Keep a phone hotspot ready.
  - At hour 20, record real Places, Routes, Gemini and decision
    responses for the demo location into `fixtures/`, so `DEMO_MODE` can replay them.
    Fixtures are keyed by API + vibe; in `DEMO_MODE` a missing key falls
    back to the most recent fixture for that API.
- **Last resort:** a screen recording of the full script, made at hour 28.
- **Sleep:** stagger two 3-hour sleep shifts so someone is always awake,
  and never sleep across a checkpoint.

## 36-Hour Timeline

| Hour | Andy | Riley | Ojas |
| --- | --- | --- | --- |
| 0–2.5 | Scaffold the monorepo (Expo Router, Express, Socket.io, contract package), CI, CODEOWNERS, deploy skeleton | GCP billing and budget alert, restricted keys (Places New, Routes). Matching core as pure TS functions with all vibe/slot tests (no DB) | Contract zod schemas, Prisma schema and first `db:push` on Atlas, auth |
| 2.5–8 | Shell, navigation, component kit, onboarding container, event-card skeleton on stub data | Seed script, busy-block PUT, client calendar module, matcher wired to DB | Friends and handshake, voting, Ghost Pass, resolution, socket server |
| **8** | **Checkpoint:** seeded users → run matcher → card on 2 phones → vote → confirmed. Template blurbs and stubbed venues are fine. Backend deployed. | | |
| 8–20 | Full onboarding flow, favorites, every card state, polish | Places plus route matrix live, report-closed, matcher triggers | Venue Intelligence (Gemini) plus fallback, expiry and chatted handling |
| **20** | **Checkpoint:** full demo script on real phones against the deployed backend. Record fixtures. | | |
| 20–28 | Fix what broke, then stretch, if the hour-20 checkpoint passed cleanly: (1) the MongoDB Atlas showcase chosen at hour 8, then (2) expenses (Ojas) | | |
| 28 | Feature freeze. Screen-record the demo. | | |
| 28–32 | Rehearse the demo script, write the pitch | | |
| 32–34 | Buffer | | |
| 34–36 | Final polish, submit, final rehearsal | | |

## Before Hour 0 (if the rules allow non-code prep)

- Create the GCP project, enable billing, add a budget alert, and create
  API keys for Places (New) and Routes. Get a Gemini API key.
- Create the Expo, DigitalOcean, and GitHub repo accounts. Push the
  context kit.
- Set up the demo calendar account on phone A, and install Expo Go on all
  three phones.

## Decisions Log

| Date | Decision |
| --- | --- |
| 2026-09-26 | **Database: MongoDB Atlas** (Prisma 6, `provider = "mongodb"`). The MongoDB sponsor challenge requires Atlas as the database. No migrations; `db:push` syncs indexes. |
| 2026-09-26 | **Reach goal: MongoDB Atlas showcase**, either (A) a geospatial venue cache or (B) change streams driving the sockets. Decide at the hour-8 checkpoint; build in hours 20–28. Ranked above expenses. |
| 2026-09-26 | **Travel mode: DRIVE** (`routingPreference` TRAFFIC_AWARE). Matches the Waymo/autonomous-ride framing. |
| 2026-09-26 | **Hosting: DigitalOcean App Platform** instead of Railway. Same shape as Railway: GitHub auto-deploy and a long-running process for Socket.io. |
| 2026-09-26 | **Two-layer social graph (#93, after the demo).** Adding someone sends a visible friend request; close friends stay a silent flag that can only be set on an accepted friend. Declines are soft (the requester still sees "pending") so they're never announced. `GET /friends/close` no longer returns a `mutual` flag. |
| 2026-09-26 | **Email verification (#91, after the demo).** Sign-up emails a 6-digit code (Resend). While `EMAIL_VERIFICATION_REQUIRED` is true, unverified accounts can't be found, requested or accepted as friends, so they never reach the matcher. It's `false` on the demo deploy. |
| 2026-09-26 | **Squad consent (#76, after the demo).** Joining needs the invitee's yes. In a squad that already has 3+ active members, any active member can also object (remove the invite) within 24 h of it being sent; an accepted invite turns active once that window passes (a 60 s sweep). Smaller squads skip the window. Invitees must be the inviter's accepted friends; at most 6 people counting invites. The matcher should use active members only (#77). |
| 2026-09-26 | **Profiles (#96, after the demo).** Every user in an API payload is a `PublicUser` `{ id, username, display_name }` where `display_name` falls back to the username. Avatar upload is deferred until a DigitalOcean Spaces bucket exists. |
| 2026-09-26 | **Display labels (#211).** Andy owns how a person is labeled across the mobile app: `displayName()` in `apps/mobile/src/lib/displayName.ts` (the display name, else the username). Lists and profiles keep `@username` under the name where people need to tell accounts apart or search. Onboarding asks for the name right after sign-up (skippable, never on login). Label-only edits to Ojas's feature screens get Ojas's review; `features/friends/PersonLink.tsx` is co-owned. |
| 2026-09-26 | **Demo location: around FIU's Modesto A. Maidique Campus (Miami).** It's the hackathon venue, so the presenter's live device location is on campus. |
| 2026-09-26 | **Invite source and per-viewer privacy (#206).** Each participant's `invite_source` (creator/direct/squad) is derived from the event's `created_by_id` and `source_group_id`, with no new columns (the schema stays with its steward). Only the human creator sees the whole roster and can infer a Ghost Pass; squad members see their squad and its visible passes; direct invitees see themselves and the creator. Automated close-friend proposals are direct invites with no creator view; automated squad proposals use squad rules. The creator's own pass is visible to everyone (they're the host). This supersedes the shared participant card and attendee list (§9 "Who sees what"). Stored per-participant provenance for mixed events (#207) is a `schema` issue for Ojas. |
| 2026-09-26 | **Pass lifecycle (#210).** A squad Pass reuses `vote_status = ghost_passed` instead of a new status; the kind (Ghost vs visible) is derived from invite source with `passKind()`, so no schema change was needed. A vote can replace a pass until voting closes; after close both are final. A direct invitee's Ghost Pass then loses the event (card, list, chat, sockets, push); a visible Pass (creator or squad) keeps the card and chat and isn't an attendee. The pass endpoint keeps its `ghost-pass` path. See §9 "Pass lifecycle". |
| 2026-09-26 | **Event chat for squad hangouts (#212).** Squad hangouts (any squad invitee) get the existing chat (same messages, paging, `event:message` and `ChatScreen`) from creation: while voting, after confirmation, as `chatted`, and read-only after `ends_at`; `expired` closes it. Members are the creator and the squad, squad passers included. Direct invitees are never in a squad or mixed chat, as readers or posters: a poster's name reveals them to everyone in the room, and a direct invitee may only see themselves and the creator, so any room holding direct invitees next to squad members breaks §9. Direct-only events keep the `chatted` fallback exactly as before. One rule, `chatAudience()` on `eventAudience()`, feeds the routes, the socket recipients and the card's new `viewer.chat` (`open`/`read_only`/null), so the client never infers it (#217 shows "Open chat" from it). See §9 "Event chat". |
| 2026-09-26 | **Decision models: Laya + Jev; Gemini writes text (#196, #227).** Decisions (propose gate, vibe, venue fit) go through `askDecision`: fine-tuned Laya (self-hosted) first, then Jev `jev-1.13.0`, then deterministic code. Gemini only writes blurbs and `match_reason`, and generates Laya's training scenarios; Jev labels them. `rankWithGemini` is removed (#231). Auto-proposals come back weekly (Mon 09:00 America/New_York) plus a "Find a hangout now" demo button (#232/#233), which replaces the close-friend star as the demo trigger. |
| 2026-09-27 | **Laya deferred; scheduler ships on Jev (#196, #274).** We hit a GPU roadblock, so decisions run on Jev with the deterministic fallback. The training data (#235) and the format alignment (#256) stay. Fine-tuning, eval and hosting move to #274 (#236 and #237 closed). |
| 2026-09-27 | **Venue swap privacy scoping (#333).** Venue swap routes (`POST /events/:id/report-closed` and `change-spot`) scope socket `event:venue_changed` and Expo push notifications to `eventAudience(…, false)` so that ghost-passers (direct invitees who passed) do not receive swap alerts. Callers must satisfy `canSeeEvent()` / `keepsAccess()`, and the 409 stale-venue response checks `canSeeEvent()` to prevent card leakage. |
| 2026-09-27 | **Squads only; closeness deferred (#320).** The scheduler (weekly cron, demo button, `/internal/run-matcher`) proposes only to whole squads with 3–6 active members and to Riley's Mixers (#215); friend pairs, cliques and one-drop subsets are skipped. Manual hangouts are unchanged. Ranking is `0.6 · staleness + 0.4 · soonness`; closeness is documented as deferred in §5. The demo trio forms a squad instead of starring each other. |
| 2026-09-27 | **No fixed activity list in the automated flow (#322).** One broad Places Nearby Search finds leisure places near the squad; code keeps the ones open in the free window, ranks them by worst commute, and times each option at or after the slot start. Gemini only labels each place as an activity with a typical length. Until preference fit (#311), code picks the 3 best by commute with distinct labels (`pickActivities`). Fewer than 3 → the fixed-vibe venues. Manual New hangout keeps the fixed vibes. |
| 2026-09-27 | **Chat intent suggestions (#325).** After a chat message is saved, `askDecision` classifies it in the background (`chatIntentRequest`: the message text only, capped at 300 chars). At ≥ 0.75 on `cant_make_it` or `change_spot` the sender alone gets `chat:suggestion` (`{ event_id, message_id, kind }`) and a chip that runs the existing Pass or Change spot action; `running_late` gets a hint chip; `logistics` and `just_chatting` get nothing. Sender-only because a direct invitee's Pass is a Ghost Pass. Nothing is stored; a failed call does nothing. |
| 2026-09-27 | **Private budget + price cap (#324).** `User.budget` (one JSON field, contract `Budget`): per outing type, typical spend per person (whole USD 0–500) and how often. Private like the matching profile: only `Me` and the decision model, never Gemini. Gemini's describe step also labels each place's spend category; code drops candidates above 1.25 × the lowest member's spend for that category (Places `price_level` → $15/30/60/100), then preference fit sees each member's budget as plain-word lines. |
| 2026-09-27 | **Invite into an existing hangout (#345).** Any participant who still has the event and hasn't passed can invite accepted friends into a voting or confirmed hangout until it starts (not Mixers), from "Invite friends" on the card. Squad and friend hangouts use the same path; #218 nominations are untouched. Late invitees are always `direct`, so §9 holds unchanged: they see themselves and the creator, their pass is a Ghost Pass, and they never join a squad chat. Inviting someone already in the event returns the same 204, so the response can't reveal a hidden direct invitee. After close a direct invitee who hasn't responded can still say "Can't make it" (`POST /events/:id/decline`, stored as `ghost_passed`) until the start; otherwise they count as attending, like any non-responder. |
| 2026-09-27 | **Preference fit picks the options (#311).** Each squad member's private profile (#310) goes to the decision model as one `fit` Choice over the discovered candidates (no names or ids, profile text as data). Code sums the members' probabilities and takes the top 3 distinct activities; the squad is proposed only when `propose` P(A) ≥ 0.6 and `squadAppeal` (the #1 pick's mean probability) ≥ 0.2, and `force` skips both. Any member call fails → the 3 best by commute. The automated flow drops the group `vibe` question and venue fit; Gemini never sees the profiles. |
| 2026-09-27 | **Laya is live (#274).** The fine-tuned checkpoint `TheKnack/laya-web-decisions` runs on a CPU droplet (`scripts/laya/serve.py` behind Caddy at `https://174-138-33-82.sslip.io`). The deploy sets `LAYA_URL`, so `askDecision` tries Laya first, then Jev, then code. |
| 2026-09-27 | **Close-friend 1-on-1s are back (#404, partly supersedes #320).** With squads only, someone whose squad already had a live hangout and who had fewer than 4 people for a Mixer got nothing from the scheduler or **Find a hangout now**, which contradicted the MVP scope (mutual close-friend pairs + squads). Mutual close-friend pairs are candidates again at the lowest priority, with one new proposal per person per run (`onePairPerPerson()`), so the squad demo still gets exactly one squad card. Closeness stays deferred in ranking. |

### Demo geography (seed values, stored rounded to 3 decimals)

| Who | Home location | Approx. |
| --- | --- | --- |
| Presenter (phone A) | Live device location at the venue | FIU MMC, ~25.757, -80.375 |
| Riley (seed) | 25.781, -80.360 | ~3 km north of campus |
| Ojas (seed) | 25.700, -80.370 | ~6 km south, toward Kendall |

- The homes are spread out on purpose, so the "worst commute" ranking
  visibly picks a venue that's fair to all three instead of one next to
  a single person.
- The centroid lands near campus, so the 4 km Nearby Search covers the
  SW 8th St / Westchester / Sweetwater restaurant strip.
- Record `fixtures/` from these exact coordinates at the hour-20
  checkpoint.
- All three users share `America/New_York`.
