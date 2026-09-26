# AGENTS.md — rules for every coding agent on Web

Six agents (Claude, Antigravity/Gemini, ChatGPT/Codex) work in parallel in
this repo during a 36-hour hackathon. These rules exist so they don't
collide. **`wiki/plan.md` is the source of truth.** If this file and the
plan disagree, the plan wins; flag the mismatch in your PR.

## Before you write any code

1. Read `wiki/plan.md`, at minimum the sections your issue touches.
2. Work from exactly one GitHub Issue that has acceptance criteria. If
   there isn't one, stop and ask your human to create it.
3. Check which lane the issue belongs to (see below). Edit only files in
   that lane.

## Lanes (who owns what)

| Lane | Owner | Paths |
| --- | --- | --- |
| Availability, matching, venues, mobility | Riley | `apps/server/src/modules/{calendar,matching,venues}/`, `apps/server/scripts/seed.ts`, `apps/mobile/src/features/calendar/` |
| Identity, social graph, decision, AI | Ojas | `apps/server/src/modules/{auth,friends,groups,intelligence,voting,expenses}/`, `apps/server/src/realtime/`, `apps/server/prisma/`, `apps/mobile/src/features/{auth,friends}/` |
| Shell, onboarding, event card, demo | Andy | `apps/mobile/app/`, `apps/mobile/src/ui/`, `apps/mobile/src/features/{favorites,event-card}/`, `apps/server/src/modules/{events,favorites}/`, `apps/server/scripts/demo-reset.ts` |
| Shared contract | All three | `packages/contract/` |

- **`apps/server/prisma/schema.prisma` and migrations:** only Ojas (the
  schema steward) edits them. If you need a schema change, open an issue
  labeled `schema` and stub around it.
- **`packages/contract/`:** a PR that touches it gets the `contract` label
  and needs approval from the other two humans.
- **Something in another lane is broken or missing:** open an issue for
  that owner. Don't fix it yourself.

## Branches, PRs, merging

- Branch name: `<name>/<issue#>-<slug>`, for example
  `riley/12-vibe-slot`.
- Each human's two agents run in **separate git worktrees**, never in the
  same checkout.
- Keep PRs small, one issue each. Put `Closes #<n>` in the description.
- Self-merge is allowed when CI is green **and** the PR doesn't touch
  `packages/contract/` or `prisma/`.
- Merge order when things depend on each other: contract, then backend,
  then frontend. If an endpoint isn't merged yet, stub it using the
  contract's types.
- Dependencies go only in your own app's `package.json`. On a
  `pnpm-lock.yaml` conflict: rebase on `main`, then run `pnpm install`.
  Never hand-merge the lockfile.

## Hard invariants (breaking these fails review)

**Time**
- All stored times are `timestamptz`. Compare instants, never
  `day_of_week`. Convert to local time (IANA `users.timezone`) only for
  vibe classification and display.

**Privacy**
- Calendar event titles, notes and attendees never leave the device.
  Only `{starts_at, ends_at}` busy blocks are sent.
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
- Travel mode is `DRIVE` with `routingPreference: TRAFFIC_AWARE`.

**AI boundary**
- Gemini is called in exactly one place:
  `apps/server/src/modules/intelligence/curateVenues`.
- Everything else is deterministic TypeScript: free windows, groups,
  vibe/slot, ranking, venue filtering, route scoring and backups.
- The Gemini call uses a JSON `responseSchema`, is validated (every
  place ID must come from the input), has an 8-second timeout, and falls
  back to a non-AI result.

**Keys and data**
- API keys come only from env vars. Never commit `.env`.
- A new env var goes in `.env.example` in the same PR.
- `DEMO_MODE=true` replays `apps/server/fixtures/` instead of calling
  Google or Gemini. Any new external call needs a fixture path too.

## Definition of done

- The issue's acceptance criteria pass.
- `pnpm -r typecheck` and `pnpm -r test` pass locally, and CI is green.
- Pure logic (matching, vibe/slot, scoring, splits, resolution) has unit
  tests. The vibe/slot cases in `wiki/plan.md` §4 are required, verbatim.
- No `any` at a contract boundary. Request and response bodies are parsed
  with the zod schemas from `packages/contract`.
- The PR description says what you changed, how you tested it, and
  anything you stubbed.

## Things that will bite you

- **Prisma has no generated columns.** Friendship mutuality is computed
  in queries. The partial unique index on `events(group_key)` is raw SQL
  in the migration.
- **Socket payloads are thin** (`{ event_id }`). The client refetches
  `GET /events/:id`, so don't add fat payloads.
- **The matcher runs behind a single in-process mutex.** Don't call the
  pipeline around it.
- **Expo Go is the target.** Don't add a native module that forces a dev
  build without asking the team first.
- **Demo config:** `VOTE_TIMEOUT_SEC=90`, `COOLDOWN_HOURS=0`,
  `REPORT_CLOSED_WINDOW_HOURS=168`.
