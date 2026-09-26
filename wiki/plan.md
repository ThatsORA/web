# Web — Hackathon Plan (v2.1)

36-hour hackathon build. Team: Andy, Ojas, Riley. Two AI agents per person
across three vendors (Claude, Antigravity, ChatGPT), all writing code in
parallel against one repo that starts empty (capstone concept only). This
doc is the source of truth: AGENTS.md and the other wiki pages follow it,
and wherever they disagree, this doc wins.

## Concept

Web removes the coordination work from hanging out. It reads when friends
are busy, finds free windows that overlap across mutual close-friend
groups, suggests venues that fit the moment and are fair for everyone to
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
5. **Accept + silent star (B, C, A).** Riley and Ojas accept the request
   on their Friends tab and star the presenter as a close friend; A opens
   Friends and stars them back. Nobody is told who starred whom. Once the
   last star lands, all three form a mutual clique (Riley and Ojas are
   already mutual in the seed data), which triggers the matcher.
6. **The proposal appears (A, B, C).** An event card arrives on all three
   phones within a few seconds (a "Finding a time…" state covers the
   wait): "Thu · 6:30–8:30pm · Dinner". It shows
   three venue options. Each has an AI blurb plus a line of facts, for
   example "★4.6 · $$ · max 14 min travel".
7. **Ghost Pass (C).** Ojas taps Ghost Pass. Every phone shows "2 of 3
   responded". A ghost pass looks exactly like a vote while voting is
   open.
8. **Vote (A, B).** Both vote, voting closes early because everyone has
   responded, and the card flips to **Confirmed**. It shows the venue,
   each person's travel time, and a map pin.
9. **Finale: "It's closed" (B).** Riley taps the button, and all phones
   swap instantly to the backup venue: "Swapped to X · max 11 min".

Two things are deliberately not in the demo: expenses and the fallback
chat. That is the reason they're stretch work or cut below.

## Scope

**Build (the demo depends on these):** sign-up and onboarding, busy-block
sync from the device calendar, mutual close friends, the matcher (free
windows, group formation, vibe and slot, deterministic ranking), venue
pipeline (Places, then route matrix, then Gemini curation and blurbs),
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
- Squad management and consent UI (explicit groups are seeded only)
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

explicit_groups (id, name, created_by)            -- seeded only in v2
group_members   (group_id, user_id, role)  pk(group_id, user_id)

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
| GET / PATCH | /me | Ojas | Profile: timezone, home_lat/lng, travel_mode |
| PUT | /busy-blocks | Riley | Replace the caller's blocks inside `[horizon_start, horizon_end]` in one transaction |
| GET | /users/search?q= | Ojas | Username search. Never reveals whether they added you |
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
| GET | /events | Andy | My open and recent events |
| GET | /events/:id | Andy | `EventCardPayload`: options, facts, blurbs, progress, outcome. Never includes voter identities |
| POST | /events/:id/vote | Ojas | `{ option_id }`. Can be changed until voting closes |
| POST | /events/:id/ghost-pass | Ojas | Quietly opt out |
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

A candidate group has 2–6 members and comes from one of four sources:
- **Explicit groups:** every member of each explicit group.
- **Mutual pairs:** each mutual close-friend edge. One-sided adds never
  become suggestions.
- **Mutual cliques:** each maximal clique in the mutual close-friend
  graph (Bron–Kerbosch, trivial at demo scale).
- **Quorum subsets:** for any group with 4 or more members, each subset
  with one member dropped.

Groups are deduplicated by `group_key`. Members may span timezones; each
candidate retains every member's IANA timezone. At equal base score, pairs
get a 0.85 size factor so groups of 3 or more rank first.

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

### 5. Ranking (Riley, deterministic shortlist + Gemini re-rank)

Each (group, slot) candidate gets a score:

```
base_score = 0.40 · closeness   (mean interaction_score over member pairs, 0..1)
           + 0.35 · staleness   (min(days since last hangout, 14) / 14; never = 1)
           + 0.25 · soonness    (1 − hours_until_start / 168)
score = base_score × 0.85 for pairs; base_score for groups of 3 or more
```

Ties go to the earlier start, then to `group_key` in lexical order. This
deterministic score builds a top-10 shortlist.

Gemini Flash re-ranks that shortlist using only aggregate facts: member
count, mean closeness, days since the last hangout, vibe, local day/time,
and favorite-category overlap. It returns a non-empty subset of candidate
IDs in best-first order plus a reason of at most 90 characters. IDs must
be unique and come from the shortlist. Invalid output, timeout, a missing
key, or a missing demo fixture preserves deterministic order and stores a
null reason. Results are cached by a hash of the candidate facts.

Candidates are processed greedily after the optional re-rank. A candidate
is skipped if its group already has an open event, or if any member already
belongs to an open event whose slot overlaps.

### 6. Venue candidates (Riley)

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

### 8. Venue Intelligence (Ojas; venue Gemini call)

**Called as** `curateVenues(RankedVenue[], context) → EventOption[3]`.

**Input:**
- The top 5 venues, each with its structured fields, max and total travel
  time, and up to 3 review snippets (200 characters or fewer each).
- Review snippets come from 5 Place Details calls, one per venue, so the
  more expensive review field is never requested in search.
- Context: the vibe tag, the slot's local time, and counts of the group's
  favorite categories.

**Model call:** use a Flash-tier Gemini model with a JSON `responseSchema`:
`{ options: [{ place_id, blurb }] }`, with exactly 3 options and blurbs of
90 characters or fewer. The prompt tells the model to (1) drop venues whose
reviews contradict the vibe, for example a steakhouse tagged casual; (2)
pick 3; and (3) write each blurb using only facts from the input.

**Validation:** the result must contain 3 distinct place IDs, all taken
from the input, and every blurb must be within the length limit.

**Fallback:** if validation fails, or no response arrives within
`GEMINI_TIMEOUT_MS` (8 seconds), use the top 3 by `route_score` with
`ai_blurb = null`. The card always shows the deterministic `facts_line`,
so it never looks broken.

**Cache:** results are cached by vibe plus the sorted place IDs.

### 9. Voting (Ojas)

- **Opening:** the event is created with status `voting`. Set
  `vote_closes_at` to whichever comes first: creation + `VOTE_TIMEOUT_SEC`,
  or 2 hours before the slot starts.
- **Casting:** each participant either votes for one option (and can
  change it until close) or taps Ghost Pass.
- **Anonymity:**
  - The API and sockets never expose who voted for what.
  - Tallies stay hidden until voting closes.
  - Progress shows "responded / total", and **a ghost pass counts as
    responded**, so it looks exactly like a vote.
  - Once confirmed, the attendee list is shown, so a ghost-passer's
    absence is visible but never announced. That makes it quiet, not
    invisible, and the pitch should say so honestly.
- **Closing:** voting closes early once everyone has responded, and
  otherwise at `vote_closes_at`. A sweep runs every 15 seconds.

### 10. Resolution (Ojas)

- **Fewer than 2 people remain after ghost passes:** the event becomes
  `expired`.
- **At least 2 people remain and at least 2 votes were cast:** the event
  becomes `confirmed`.
  - The option with the most votes wins. A tie goes to the lower
    `route_score`.
  - The venue fields are locked in, and voters' status becomes
    `confirmed`.
  - `backup_venues` = the losing options (most votes first, then by
    route_score), followed by the unused top-5 venues.
- **At least 2 people remain but fewer than 2 votes:** the event becomes
  `chatted`. The card shows the window and who's free, plus a
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
- **No new external API calls.** Travel times for the backup are already
  stored in its snapshot.
- **Honest limit:** the app can't verify real-world status. The human tap
  is the fix, and the precomputed backup list is what makes it instant.

### 12. Expenses (Ojas, stretch)

`POST /events/:id/expenses` takes an equal split over the confirmed
attendees, using the cent-rounding rule above. The "settled" toggle is
manual.

### Matcher triggers

- node-cron every 5 minutes
- whenever a close-friend handshake becomes mutual (for the groups
  containing that pair)
- after a `PUT /busy-blocks`
- `POST /internal/run-matcher`

All four go through one in-process mutex, so a cron tick and a handshake
trigger can't race. The partial unique index on `events.group_key` is the
backstop if they ever do.

## Where AI Is and Isn't Used

**Deterministic code:** busy-to-free math, group formation, vibe and slot,
shortlist scoring, Places filtering, route-matrix scoring, and backup
ordering. These form the complete fallback path.

**Gemini, two calls:** Smart Match Ranking reorders the deterministic
top-10 shortlist from aggregate matching facts and writes the card's match
reason. Venue Intelligence reads unstructured review text to catch vibe
mismatches and writes vote blurbs. Both validate IDs against their inputs
and fall back to deterministic results.

**Future work (pitch only):** learned ranking once real hangout history
exists, natural-language expense entry, and summaries of the fallback chat.

## Config (env)

| Var | Default | Demo |
| --- | --- | --- |
| VOTE_TIMEOUT_SEC | 43200 | 90 |
| COOLDOWN_HOURS | 48 | 0 |
| MATCH_HORIZON_DAYS | 7 | 7 |
| MIN_LEAD_HOURS | 2 | 2 |
| BUSY_PADDING_MIN | 15 | 15 |
| GEMINI_TIMEOUT_MS | 8000 | 8000 |
| REPORT_CLOSED_WINDOW_HOURS | 24 | 168 |
| DEMO_MODE | false | true only if the network fails (replays `fixtures/`) |
| INTERNAL_SECRET | — | set |

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
  - At hour 20, record real Places, Routes and Gemini responses for the
    demo location into `fixtures/`, so `DEMO_MODE` can replay them.
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
| 2026-09-26 | **Demo location: around FIU's Modesto A. Maidique Campus (Miami).** It's the hackathon venue, so the presenter's live device location is on campus. |

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
