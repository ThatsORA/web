# Web

Web proposes hangouts for college friend groups on its own. It finds free
windows that overlap across mutual close friends, suggests venues that are
fair for everyone to drive to, and settles the plan with an anonymous vote.

Built in 36 hours at the FIU hackathon (Google/Waymo Mobility Challenge).

## Start here

1. **Plan:** [`wiki/plan.md`](wiki/plan.md) is the source of truth: demo
   script, scope, schema, API contract, pipeline and timeline.
2. **Agent rules:** [`AGENTS.md`](AGENTS.md). `CLAUDE.md` and `GEMINI.md`
   point to it, so every vendor follows the same rules.
3. **Ownership:** [`CODEOWNERS`](CODEOWNERS). Replace the placeholder
   handles first.
4. **Work:** every agent session starts from a GitHub Issue that uses the
   "Agent task" template.

## Layout

```
packages/contract   zod schemas + types shared by server and mobile (API Contract v2)
apps/server         Express 5 + Socket.io + Prisma 6 (Postgres)
apps/mobile         Expo SDK 57 + Expo Router (routes in src/app/)
wiki/plan.md        the plan
```

## Setup

```bash
corepack enable                      # gives you pnpm 10
pnpm install
cp .env.example apps/server/.env     # fill in keys + DATABASE_URL
```

**First migration (Ojas, once).** Needs a Postgres `DATABASE_URL`:

```bash
cd apps/server
pnpm prisma migrate dev --name init --create-only
```

Then append this SQL to the generated `migration.sql` (Prisma can't
express it):

```sql
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_pair_order"
  CHECK ("user_low_id" < "user_high_id");
CREATE UNIQUE INDEX "events_open_group_key"
  ON "events" ("group_key") WHERE "status" IN ('voting', 'confirmed');
```

Then apply it: `pnpm prisma migrate dev`.

**Run:**

```bash
pnpm dev:server      # http://localhost:3000/health
pnpm dev:mobile      # scan the QR with Expo Go
```

On a phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to your
laptop's LAN IP (not localhost), or to the deployed server.

**Checks** (the same ones CI runs): `pnpm -r typecheck && pnpm -r test`.

## Scaffold status

- Every route in the contract exists and returns `501 not_implemented`,
  with the owner's name in the message. Replace the stub in your lane.
- Also included:
  - the matcher mutex (`modules/matching/matcher.ts`)
  - the deterministic `curateVenues` fallback, with tests
  - the Socket.io JWT room join
  - the `DEMO_MODE` fixture helper (`lib/demoMode.ts`)
  - the typed mobile API client (`src/lib/api.ts`)
