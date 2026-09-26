# AGENTS.md — rules for every coding agent on Web

Six agents (Claude, Antigravity/Gemini, ChatGPT/Codex) work in parallel in
this repo during a 36-hour hackathon. These rules exist so they don't
collide. **`wiki/plan.md` is the source of truth.** If this file and the
plan disagree, the plan wins; flag the mismatch in your PR.

## Your session, step by step

Your human has already made a git worktree for you on a branch named
`<name>/<issue#>-<slug>`. Work only in that folder.

1. **Get the issue.** Your human pasted it, or run
   `gh issue view <n> --repo ThatsORA/web`. No issue number? Stop and ask.
   Don't invent work.
2. **Sync:** `git pull --rebase origin main`.
3. **Read** the `wiki/plan.md` sections the issue links to, the Lanes table
   below and the Scaffold map below.
4. **Check the setup** (only if `node_modules` is missing):
   `pnpm install && pnpm --filter @web/server exec prisma generate`.
5. **Build it** in your lane only. Write unit tests next to the code
   (`foo.ts` → `foo.test.ts`, Vitest).
6. **Verify:** run `pnpm -r typecheck && pnpm -r test` from the repo root.
   Both must pass. Then walk the issue's acceptance criteria one by one.
7. **Commit** small, clear commits (`matching: add classifySlot + §4
   tests`). Never commit `.env`, and never commit to or force-push `main`.
8. **Push and open the PR:** `git push -u origin HEAD`, then
   `gh pr create --repo ThatsORA/web --fill` and edit the body to use the
   PR template, including `Closes #<n>`. If `gh` isn't available, stop and
   give your human the PR title and body to paste.
9. **Report back:** what's done, what's stubbed, and any issue you opened
   for another lane.

If you get blocked by another lane (a missing endpoint, function or
schema field): stub it behind the contract type, open an issue for its
owner, note it in your PR, and keep going. Never edit their files to
unblock yourself.

## Commands

| What | Command |
| --- | --- |
| Install (repo root) | `pnpm install` |
| Prisma client (after install or schema pull) | `pnpm --filter @web/server exec prisma generate` |
| All checks (same as CI) | `pnpm -r typecheck && pnpm -r test` |
| One package's tests | `pnpm --filter @web/server test` |
| Server dev | `pnpm dev:server`, then open `localhost:3000/health` |
| Mobile dev | `pnpm dev:mobile` (Expo Go) |
| Seed / reset (needs DB) | `pnpm --filter @web/server db:seed` / `demo:reset` |

- **No database needed:** pure-logic issues (matching math, ranking,
  resolution, UI on stub data).
- **Database needed:** `DATABASE_URL` in `apps/server/.env` (copy
  `.env.example`); ask your human for the shared URL.
- **Migrations:** never run `prisma migrate dev` unless you are Ojas's
  agent on a schema issue. Everyone else only runs `prisma generate`.

## Scaffold map (what already exists; extend it, don't rebuild it)

**Server** (`apps/server/src/`)
- `app.ts` mounts every module router under `/api/v1`. Every contract
  route already exists and returns `501 not_implemented`. **Your job is
  to replace the stub handler for your route, not to add a new route.**
- `lib/auth.ts`: `requireAuth` (sets `req.userId`; cast to
  `AuthedRequest`), `signToken`, `requireInternal`.
- `lib/prisma.ts`: the shared `prisma` client. Import it; never create
  another one.
- `lib/demoMode.ts`: wrap **every** Google/Gemini call as
  `withFixture(api, key, () => liveCall())`.
- `env.ts`: typed config. Read `env.X`, never `process.env.X`.
- `modules/matching/matcher.ts`: `triggerMatcher()` is the only way to
  run the matcher.
- `modules/intelligence/curateVenues.ts`: `curateVenues()` plus the
  working deterministic fallback.
- `modules/voting/lifecycle.ts`: `openVoting()` and `sweepVoting()`.
- `realtime/index.ts`: `emitToUsers(userIds, event, payload)`. Use the
  `SocketEvents` names and keep payloads thin.

**Mobile** (`apps/mobile/src/`)
- `app/` holds the Expo Router routes: the `(onboarding)` and `(main)`
  groups.
- `lib/api.ts`: `api(path, schema, { method, body })`, the typed fetch
  that parses the response with a contract schema. Always use it.
- `features/<name>/` is each lane's feature code, and `ui/` holds shared
  components (Andy).

**Contract** (`packages/contract/src/`)
- `schemas.ts` (zod schemas + types), `routes.ts` (`routes.*`,
  `API_PREFIX`) and `socket.ts` (`SocketEvents`,
  `ServerToClientEvents`, `userRoom`).
- Import from `@web/contract`, and never copy a type locally.

**Calling across lanes is fine; editing across lanes is not.** Riley's
matcher calls Ojas's `curateVenues()` and `openVoting()`; everyone calls
`triggerMatcher()`, `emitToUsers()` and `api()`. If a signature doesn't
fit, open an issue for the owner.

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
| Shell, onboarding, event card, demo | Andy | `apps/mobile/src/app/`, `apps/mobile/src/ui/`, `apps/mobile/src/lib/`, `apps/mobile/src/features/{favorites,event-card}/`, `apps/server/src/modules/{events,favorites}/`, `apps/server/scripts/demo-reset.ts` |
| Shared contract | All three | `packages/contract/` |
| Shared server wiring | All three (small edits only) | `apps/server/src/{app,index,env}.ts`, `apps/server/src/lib/{prisma,demoMode,notImplemented}.ts`, `.env.example` |
| Repo config | Andy | root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.github/`, `CODEOWNERS` |

- **Shared server wiring:** add your env var to `env.ts` + `.env.example`,
  or register a cron job in `index.ts`. Keep it to the few lines you need
  and say so in the PR. `lib/auth.ts` belongs to Ojas.

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

## Pinned versions (don't upgrade mid-hackathon)

- **Expo SDK 57** (React Native 0.86, React 19.2, TypeScript 6). Expo
  changes every SDK, so read `apps/mobile/AGENTS.md` and use the v57 docs,
  not memory. Add Expo packages with `npx expo install <pkg>` from
  `apps/mobile`.
- **Prisma 6** (`prisma-client-js`, `url` in `schema.prisma`). Prisma 7
  changed the config format, so don't write Prisma 7 code.
- **Express 5, zod 3, Socket.io 4, Vitest 5, Node 22, pnpm 10.**
- Server code runs through `tsx` (ESM, bundler resolution), so relative
  imports need no `.js` extension.

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
