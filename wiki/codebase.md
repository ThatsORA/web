# Codebase map and lanes

What already exists and who owns which paths. Extend the scaffold; don't
rebuild it. Edit only files in your lane.

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

- **`apps/server/prisma/schema.prisma` and `db:push`:** only Ojas (the
  schema steward) edits them. If you need a schema change, open an issue
  labeled `schema` and stub around it.
- **`packages/contract/`:** a PR that touches it gets the `contract` label
  and needs approval from the other two humans.
- **Something in another lane is broken or missing:** open an issue for
  that owner. Don't fix it yourself.
