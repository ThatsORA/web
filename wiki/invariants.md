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
- Search and friend endpoints never reveal whether someone added you.

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
- Gemini is called in two places:
  `apps/server/src/modules/matching/rankWithGemini` re-ranks the
  deterministic top-10 shortlist from aggregate facts, and
  `apps/server/src/modules/intelligence/curateVenues` curates venues.
- Free windows, groups, vibe/slot, shortlist scoring, venue filtering,
  route scoring and backups stay deterministic TypeScript.
- Both Gemini calls use a JSON `responseSchema`, validate output IDs,
  have an 8-second timeout, and fall back to deterministic results.
- Match ranking sends no names, emails or calendar data.

**Keys and data**
- API keys come only from env vars. Never commit `.env`.
- A new env var goes in `.env.example` in the same PR.
- `DEMO_MODE=true` replays `apps/server/fixtures/` instead of calling
  Google or Gemini. Any new external call needs a fixture path too.

## Pinned versions (don't upgrade mid-hackathon)

- **Expo SDK 57** (React Native 0.86, React 19.2, TypeScript 6). Expo
  changes every SDK, so read [`mobile.md`](mobile.md) and use the v57 docs,
  not memory. Add Expo packages with `npx expo install <pkg>` from
  `apps/mobile`.
- **Prisma 6** (`prisma-client-js`, `provider = "mongodb"`, `url` in
  `schema.prisma`). Prisma 7 changed the config format and has limited
  MongoDB support, so don't write Prisma 7 code.
- **Express 5, zod 3, Socket.io 4, Vitest 5, Node 22, pnpm 10.**
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
- **Demo config:** `VOTE_TIMEOUT_SEC=90`, `COOLDOWN_HOURS=0`,
  `REPORT_CLOSED_WINDOW_HOURS=168`.
