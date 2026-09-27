# Invariants, pinned versions and gotchas

Breaking a hard invariant fails review. Read the sections your issue
touches before you write code.

## Hard invariants (breaking these fails review)

**Time**
- All stored times are `DateTime` (a UTC BSON Date in MongoDB). Compare
  instants, never `day_of_week`. Convert to local time (IANA `users.timezone`) only for
  vibe classification and display.

**Privacy**
- Calendar event titles, notes and attendees never leave the device.
  Only `{starts_at, ends_at}` busy blocks are sent. For server-side
  Google sync, it only reads free/busy intervals.
- Votes are anonymous. No API response or socket payload may reveal who
  voted for what. Progress is `responded/total`, and a ghost pass counts
  as responded. Tallies stay hidden until voting closes.
- Event payloads are scoped per viewer (#206, plan §9 "Who sees what").
  Only a hangout's human creator sees its whole roster; nobody else ever
  receives a direct invitee they can't see, a Ghost Pass marker, or an
  attendee list, travel time or tally that reveals one. Build every event
  payload (card, list, chat membership, presence) on `viewerScope()`.
- Once voting closes, a direct invitee's Ghost Pass is final and they lose
  the event: card, list, chat, socket events and pushes (#210, plan §9
  "Pass lifecycle"). Pick every post-close recipient with `keepsAccess()` /
  `eventAudience()`, never "all participants".
- Friend status (pending/accepted) is visible to both people. Close-friend
  status never is: no endpoint or socket payload reveals whether someone
  marked you close, and a declined friend request is never announced.
- Other users only ever leave the server as `PublicUser` (id, username,
  display_name) or `PublicProfile`, which are zod-parsed so extra fields
  (email, close-friend flags) are stripped.

**Money**
- Money is always integer cents. Split evenly, then give the leftover
  cents one each to the first participants in the list (1000 ÷ 3 gives
  334/333/333).

**Google APIs**
- Use **Places API (New)** and **Routes API `computeRouteMatrix`**. The
  legacy Distance Matrix, Directions and Places APIs can't be enabled on
  new Cloud projects, so don't write code against them.
- Every Places/Routes request sends an `X-Goog-FieldMask` header. Places
  Nearby Search fields use the `places.` prefix.
- Travel mode supports `DRIVE`, `TRANSIT`, `WALK`, and `BICYCLE`, with `routingPreference: TRAFFIC_AWARE` sent only for `DRIVE`.

**AI boundary**
- Decisions (the propose gate, the vibe, venue fit) go through one client,
  `askDecision` in `apps/server/src/modules/intelligence/`: fine-tuned
  Laya (self-hosted) first, then Jev `jev-1.13.0`, then the caller's
  deterministic fallback (#196, #228).
- Gemini only writes text: the vote blurbs and `match_reason`, from
  `curateVenues`. `rankWithGemini` was removed (#231).
- Free windows, groups, which vibes are feasible for a slot, shortlist
  scoring, venue filtering, route scoring and backups stay deterministic
  TypeScript. The model only chooses among options code already computed
  (the vibe among the feasible ones, which venues fit).
- Every AI call has a timeout, a deterministic fallback, and goes through
  `withFixture`. Gemini output uses a JSON `responseSchema` with
  validated IDs.
- Decision input is plain words: no names, emails, calendar data or raw
  timestamps.
- Yes/no questions are 2-option Choices with neutral keys `A`/`B`, never
  a Noul, because Laya's English Noul has label bias.
- Thresholds use the answer's probability, not `confidence`; Laya and
  Jev define `confidence` differently.

**Keys and data**
- API keys come only from env vars. Never commit `.env`.
- Email codes are stored only as an HMAC (keyed with `JWT_SECRET`), never
  in plain text, and every check burns one of 5 attempts.
- A new env var goes in `.env.example` in the same PR.
- `DEMO_MODE=true` replays `apps/server/fixtures/` instead of calling
  Google, Gemini, Laya or Jev. Any new external call needs a fixture path too.

## Pinned versions (don't upgrade mid-hackathon)

- **Expo SDK 57** (React Native 0.86, React 19.2, TypeScript 6). Expo
  changes every SDK, so read [`mobile.md`](mobile.md) and use the v57 docs,
  not memory. Add Expo packages with `npx expo install <pkg>` from
  `apps/mobile`.
- **Prisma 6** (`prisma-client-js`, `provider = "mongodb"`, `url` in
  `schema.prisma`). Prisma 7 changed the config format and has limited
  MongoDB support, so don't write Prisma 7 code.
- **Express 5, zod 3, Socket.io 4, Vitest 5, Node 22, pnpm 10.**
- **Jev `jev-1.13.0`** (TypeSafe AI, [docs](https://docs.typesafe.ai))
  and **`laya==0.3.20`**
  ([repo](https://github.com/NandhaKishorM/laya)). Both speak
  `POST /v1/systemone`; call it with plain `fetch`, no SDK.
- Server code runs through `tsx` (ESM, bundler resolution), so relative
  imports need no `.js` extension.

## Things that will bite you

- **MongoDB via Prisma 6** (`provider = "mongodb"`):
  - IDs are string UUIDs in `_id`, so keep `@id @default(uuid())
    @map("_id")`.
  - Composite keys don't exist; use an `id` plus `@@unique([...])`.
  - No `Decimal` (use `Float`), no `@db.*` Postgres types, no raw SQL.
  - Transactions work because Atlas is a replica set; use
    `prisma.$transaction`.
- **Rules Postgres used to enforce, now in code:**
  - Sort friendship pairs so `userLowId < userHighId` before any write.
  - One open (voting/confirmed) event per `groupKey`, guaranteed by the
    matcher mutex plus a check before insert.
- **Friendship mutuality is computed in queries**
  (`lowAddedHigh && highAddedLow`); there's no stored column.
- **Socket payloads are thin** (`{ event_id }`). The client refetches
  `GET /events/:id`, so don't add fat payloads.
- **The matcher runs behind a single in-process mutex.** Don't call the
  pipeline around it.
- **Expo Go is the target.** Import calendar access from
  `expo-calendar/legacy`; SDK 57's class-based calendar API requires a
  development build.
- **Demo config:** `VOTE_TIMEOUT_SEC=43200`,
  `REPORT_CLOSED_WINDOW_HOURS=168`. `COOLDOWN_HOURS` goes back to its
  default of 48 (#232).
