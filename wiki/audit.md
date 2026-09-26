# Audit: bugs and risks (2026-09-26)

These are verified findings, ordered by demo impact. Fix them through the
owner's issue, and don't fix one outside your own lane. For build status see
[`status.md`](status.md), and for optimisations see
[`reach_goals.md`](reach_goals.md).

## Blocks the demo

1. **Friends step not mounted.** `apps/mobile/src/app/(onboarding)/friends.tsx`
   still renders `StepPlaceholder`, though `features/friends` exports
   `FriendsStep`. The fix is a one-line import (Andy, #42, PR #55).
2. **`PUT /favorites` is a 501.** `apps/server/src/modules/favorites/router.ts:8`.
   Demo step 3 fails, and `curateVenues` gets empty favourite counts (Andy, #13).
3. **"It's closed" is a 501.** `apps/server/src/modules/venues/router.ts:8`.
   There's no backup swap, and `event:venue_changed` is never emitted. The snapshot schema landed in #50, but the route is still Riley's to build.
4. **`demo-reset.ts` is a TODO.** The plan says to run it before every
   rehearsal (Andy).

## Plan mismatches

- Matcher uses hardcoded `stubRankedVenues()`
  (`matching/matcher.ts:236-258`) instead of Places Nearby plus Routes
  `computeRouteMatrix` (plan §6–7). Travel times are fabricated.
- `apps/server/fixtures/` is empty, so demo mode has nothing to replay for
  Places/Routes.

## Correctness

- **Socket ignores token changes.** `features/event-card/useEventSocket.ts`
  creates the socket in a `[]`-deps effect. After a logout and login it stays
  on the old token. Key it by token or userId.
- **`CalendarStep` has no eyebrow.** `features/calendar/CalendarStep.tsx:23`
  omits `stepEyebrow("calendar")`, unlike every other step.
- **`Callout`/`Badge` override `fontFamily` inline.** They use tokens, but
  bypass the `Txt` variants (`ui/Callout.tsx:27`, `ui/Badge.tsx:34`). Low
  severity.

## Invariants: all pass

UTC time, busy-block privacy, anonymous votes, the silent friend add, the
single Gemini call with a fallback, `env` only, one runtime Prisma client and
the matcher mutex all pass. `scripts/seed.ts` owns its own `PrismaClient`,
which is fine for a script.

## Tooling gotcha

In a fresh worktree, `pnpm -r typecheck`/`test` fail on mobile with
`Cannot find module '@web/contract'` until you run `pnpm install` in that
worktree. Server and contract pass.
