# Build status (audit snapshot, 2026-09-26, `main` @ c985b69)

What's built vs the demo script. This page goes stale fast: check
`gh issue list` / `gh pr list` before trusting it. Bugs and risks live in
[`audit.md`](audit.md), and optimisation ideas in
[`reach_goals.md`](reach_goals.md).

## Server (`apps/server/src/modules/`)

| Module | Status | Tests |
| --- | --- | --- |
| auth | Done: signup, login, `GET/PATCH /me` | yes |
| friends | Done: search, close-friend add/remove, handshake | yes |
| calendar | Done: `PUT /busy-blocks` | yes |
| matching | Done: groups → windows → slot → rank → events. **Venues are stubbed** (`stubRankedVenues`) | yes |
| intelligence | Done: Gemini `curateVenues` + fallback, cache, `withFixture` | yes |
| voting | Done: vote, ghost pass, resolution, sweep | yes |
| events | Done: `GET /events`, `GET /events/:id` via `assembleEventCard` | yes |
| realtime | Done: `created`, `progress`, `resolved`. No `venue_changed` yet | no |
| favorites | **501**: `PUT /favorites` (Andy, #13) | no |
| venues | **501**: `report-closed` (Riley, #50) | no |
| expenses | **501**: stretch (Ojas, #20) | no |
| groups | No API (seed only) | n/a |

Scripts: `seed.ts` done; `demo-reset.ts` is still a TODO (Andy).
`fixtures/` is empty (no recorded Places/Routes responses).

## Mobile (`apps/mobile/src/`)

| Demo step | Status |
| --- | --- |
| Welcome, sign up / log in, location | Done |
| Calendar sync (+ foreground re-sync) | Done |
| Favorites | UI done; server route is 501 |
| Close friends | `FriendsStep` built, **route still renders `StepPlaceholder`** (#42) |
| Event card: finding / voting / confirmed / ghost pass | Done |
| "It's closed" | UI done; server route is 501 |
| Main feed + dev `card-states` gallery | Done |

Pure-logic tests exist for every `lib/` and feature helper (11 files).

## Contract and schema

No drift between `packages/contract`, `schema.prisma` and
[`plan.md`](plan.md). The partial-unique `group_key` rule is enforced in
code rather than by an index (see [`invariants.md`](invariants.md)).

## GitHub (at audit time)

- Open: Andy #11 (deploy, PR #49), #13, #42 · Riley #50 (`schema`, needs
  Ojas) · Ojas #20 (stretch) · unassigned #16 (checkpoint), #17 (stretch).
- Hour-8 checkpoint #16 is waiting only on #11 (PR #49).
