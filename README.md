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

## DigitalOcean backend deployment

The App Platform web service is defined in [`.do/app.yaml`](.do/app.yaml). With
an authenticated DigitalOcean CLI, run `doctl apps create --spec .do/app.yaml`.
Connect `ThatsORA/web` to the DigitalOcean GitHub integration first, and grant
that integration access to the repository. In the Control Panel, the equivalent is
Create → App Platform and copying the settings from the spec. The source is `main`, with auto-deploy on push. Keep **one** web
service instance: the matcher mutex and voting sweep run in-process. The service
builds from the repository root, installs pnpm dependencies, generates Prisma,
and starts with `pnpm --filter @web/server start` (which runs `prisma db push`).
App Platform supplies `PORT=8080`; `apps/server/src/env.ts` reads it.

Set these **runtime secrets** in the App Platform service's Environment Variables
screen, using the Encrypted/Secret setting. Do not put their values in the app
spec, GitHub, logs, or a PR:

| Key | Source |
| --- | --- |
| `DATABASE_URL` | Ojas's MongoDB Atlas URI from issue #1 |
| `JWT_SECRET` | New random secret, shared only with this service |
| `INTERNAL_SECRET` | Different random secret for internal endpoints |
| `GOOGLE_MAPS_API_KEY` | Riley's restricted Places (New) and Routes key, when available |
| `GEMINI_API_KEY` | Ojas's Gemini key |

The remaining demo values are in `.do/app.yaml` and mirror `.env.example`:
`VOTE_TIMEOUT_SEC=90`, `COOLDOWN_HOURS=0`,
`REPORT_CLOSED_WINDOW_HOURS=168`, and `DEMO_MODE=false` until recorded fixtures
are needed. The spec sets `PNPM_SKIP_PRUNING=true` at build time because the
start command needs the repo's `prisma` and `tsx` dev dependencies. Keep the
runtime secrets when changing the app spec in the DigitalOcean console.

Set `EXPO_PUBLIC_API_URL` in each phone's local `apps/mobile/.env` to the
backend **origin** before starting Expo. The client adds `/api/v1` itself.
The Expo tunnel exposes Metro, not the backend, so a LAN API URL may time out
from a phone. Restart `pnpm dev:mobile:tunnel` after changing the variable:

```dotenv
EXPO_PUBLIC_API_URL=https://web-p3ljx.ondigitalocean.app
```

**Backend origin:** https://web-p3ljx.ondigitalocean.app

This is an API service. `/` returns `{"error":"not_found"}` by design;
`/health` returns `{"ok":true}`. The public health endpoint and authenticated
Socket.io connection were verified on September 26, 2026. The Atlas-backed
server is live on one $5/month container. Google Maps review snippets are
unavailable until the restricted Maps key is added; venue curation falls back
to options without snippets.

Verify the public URL from the repo root:

```powershell
Invoke-RestMethod 'https://web-p3ljx.ondigitalocean.app/health'  # {"ok":true}
$env:WEB_CHECK_JWT = '<JWT from a demo account login>'
node apps/mobile/src/lib/check-deploy.mjs 'https://web-p3ljx.ondigitalocean.app'
Remove-Item Env:WEB_CHECK_JWT
```

The script verifies both HTTP health and an authenticated Socket.io connection.
A Socket.io client without a valid JWT is rejected by design. Check that the
DigitalOcean deployment is healthy and CI is green after a push to `main`.
