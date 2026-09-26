# Web

Web proposes hangouts for college friend groups on its own. It finds free
windows that overlap across mutual close friends, suggests venues that are
fair for everyone to drive to, and settles the plan with an anonymous vote.

Built in 36 hours at the FIU hackathon (Google/Waymo Mobility Challenge).

## Start here

0. **Just open an agent and say "go".** In the main `web` folder, it sets
   you up and creates your next issue's worktree. Inside a worktree like
   `web-6`, it works on that issue. See `AGENTS.md` → "Start here".
1. **Plan:** [`wiki/plan.md`](wiki/plan.md) is the source of truth: demo
   script, scope, schema, API contract, pipeline and timeline.
2. **Agent rules:** [`AGENTS.md`](AGENTS.md) holds the principles (YAGNI,
   stay in your lane, contract first). `CLAUDE.md` and `GEMINI.md` point
   to it. The details are in [`wiki/`](wiki/README.md).
3. **Ownership:** [`CODEOWNERS`](CODEOWNERS). Riley = @rileyh6,
   Ojas = @TheRealOP, Andy = @andydo4.
4. **Work:** every agent session starts from a GitHub Issue that uses the
   "Agent task" template.

## Layout

```
packages/contract   zod schemas + types shared by server and mobile (API Contract v2)
apps/server         Express 5 + Socket.io + Prisma 6 (MongoDB Atlas)
apps/mobile         Expo SDK 57 + Expo Router (routes in src/app/)
wiki/               the plan and team docs
```

## Setup

```bash
npm install -g pnpm@10.28.0          # not corepack: it fails on Windows without admin
pnpm install
cp .env.example apps/server/.env     # fill in keys + DATABASE_URL
```

**Database: MongoDB Atlas** (shared M0 cluster, set up by Ojas). Get the
`DATABASE_URL` from Ojas privately and put it in `apps/server/.env`. MongoDB
has no migrations. After the schema changes, the steward syncs indexes
with:

```bash
pnpm --filter @web/server db:push
```

Everyone else only runs `prisma generate`.

**Run:**

```bash
pnpm dev:server      # http://localhost:3000/health
pnpm dev:mobile      # scan the QR with Expo Go
```

On a phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to your
laptop's LAN IP (not localhost), or to the deployed server. Use the server
origin only (for example `http://192.168.1.10:3000`); the client adds `/api/v1`.

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
