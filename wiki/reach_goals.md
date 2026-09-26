# Reach goals: bloat and optimisation

These don't block the demo. Pick one up only after the demo path works, and
only in your own lane. Effort: S < 30 min, M 1–3 h, L more than that.
Findings come from the 2026-09-26 audit.

## Delete (S)

- `apps/mobile/package.json`: `expo-glass-effect`, `expo-symbols`,
  `expo-web-browser`, `expo-device`, `expo-image`, `expo-linking` have
  zero imports in `src/`. Check `app.json` plugins before removing (Andy).
- `apps/mobile/src/features/voting/`: `castVote`, `ghostPass`, `useVote`,
  `useGhostPass` are unused. `event-card/useEvents.ts` makes the same calls
  inline. Either use them or delete them (Ojas).
- `apps/server/src/modules/groups/index.ts` is only `export {}` (Ojas).
- `matching/timeMath.ts` `formatSlot` is test-only; move it into the test
  file (Riley).

## Dedupe (S)

- Option row→contract mapper exists twice: `voting/lifecycle.ts:11`
  `toOption` and `events/assembleEventCard.ts:12` `optionFromRow`. Keep one
  and import it.

## Simplify (M)

- **`matching/timeMath.ts` (527 lines)** accepts dual-cased inputs
  (`start`/`starts_at`, `tz`/`timezone`, `busyBlocks`/`busy_blocks`,
  `BUSY_PADDING_MIN`/`busyPaddingMin`) and `ClassifiedSlot` carries alias
  fields (`vibe`, `starts_at`, `ends_at`). Pick one casing per field and
  update callers. That saves about 80 lines (Riley).
- **Double Gemini timeout.** `intelligence/curateVenues.ts` sets
  `AbortSignal.timeout` on the fetch (l.76) *and* a `Promise.race` timer
  (l.122). Check that fixture replay doesn't need the race, then drop one
  (Ojas).

## Performance

| Where | Issue | Fix | Effort |
| --- | --- | --- | --- |
| `matching/matcher.ts:107-110` | `runPipeline` loads all users, friendships, groups and events with no filter | Filter to open events/active users; add a `ponytail:` note | M |
| `matching/matcher.ts:124-133` | Per group, scans all events per member (O(users × events)) | Index events by participant in a `Map` first | S |
| `voting/lifecycle.ts:96-110` | `sweepVoting` closes due events sequentially | `Promise.all` independent closes | S |
| `event-card/useEvents.ts:36` | `GET /events` then N × `GET /events/:id` | Return full cards in the list response (contract change, needs all three) | M |
| `intelligence/curateVenues.ts:175` | Unbounded in-memory `Map` cache | Fine for the demo; cap it with LRU if the server runs long | S |
| `friends/router.ts:17` | Prefix search on `username` without a text index | Only matters at scale | L |

## Dev-only code in the bundle (S)

- `event-card/fixtures.ts` (98 lines) is only used by `(main)/card-states.tsx`.
  Gate the route behind `__DEV__`.

## Wiki context size (M)

[`plan.md`](plan.md) is 660 lines and loaded by every agent. We could split
it into:

- `plan.md` (~200 lines): concept, demo script, scope, team, stack,
  config, timeline.
- `schema.md`: Schema v3.
- `pipeline.md`: pipeline §1–12 (mostly Riley's lane).
- Drop "What Changed from v1", "Before Hour 0" and the stale parts of the
  decisions log. Point the API section at `packages/contract` rather than
  keeping a copy.

`plan.md` is the source of truth, so the team has to agree to this split
before anyone makes it.

## Rejected

- Deleting the `venues`/`expenses` 501 stubs: `report-closed` is a demo
  step (#50) and expenses is planned stretch work (#20). Keep them.
