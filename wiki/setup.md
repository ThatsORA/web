# Setup: onboarding a teammate (instructions for agents)

You're in the main clone on `main`: [`AGENTS.md`](../AGENTS.md) "Start
here" sent you to setup mode. Follow these steps in order. **Don't write any feature code in this session.** The goal
is to get their machine ready and hand them off to a fresh agent inside a
worktree.

## 0. Who and what machine

- **Who:** you already worked this out in AGENTS.md "Start here" step 1.
  Only ask if that failed.
- **OS and shell:** detect them. On Windows PowerShell, chain commands
  with `;`, not `&&`, and use backslash paths when you tell the human
  where to go.

## 1. Tools

Check each one. Install only what's missing.

- **Node 22+:** `node -v`. If it's older, tell the human to install Node 22
  LTS from nodejs.org and stop until they do.
- **pnpm 10:** `pnpm -v`. If it's missing, run
  `npm install -g pnpm@10.28.0`. **Don't use `corepack enable`** — it fails
  on Windows without admin rights.
- **GitHub CLI:** `gh --version`. If it's missing:
  - Windows: `winget install --id GitHub.cli`
  - macOS: `brew install gh`
  - After installing, the human must open a new terminal so the new path
    loads.
- **gh login:** the human does this themselves because it needs a
  browser. Tell them to run:
  ```
  gh auth login --hostname github.com --git-protocol https --web
  ```
  They copy the one-time code it prints and paste it at
  github.com/login/device. Then you verify with
  `gh issue view 1 --repo ThatsORA/web`. If that says "not found," an org
  owner (Andy) must approve GitHub CLI under ThatsORA → Settings →
  Third-party access.

## 2. Main clone

In the folder they cloned (`web`):

```
git pull
pnpm install
```

## 3. Their issues

List their open issues, and see what's already in flight:

```
gh issue list --repo ThatsORA/web --assignee <handle> --state open
gh pr list --repo ThatsORA/web --author <handle>
git worktree list
```

Pick their **next issue** with this rule:

1. It's open and assigned to them.
2. It has no open PR yet, and no worktree already exists for it.
3. Prefer an issue whose "Depends on" items are all closed. If none
   qualify, prefer one that can be stubbed (pure logic, or UI on stub
   data).
4. Among those, take the lowest number.

Propose it (and a second one, if they want two agents), then confirm with
them.

## 4. One worktree per agent

Each agent gets its own folder and branch. For each issue, from inside
`web`:

```
git worktree add ../web-<n> -b <name>/<n>-<short-slug>
cd ../web-<n>
pnpm install
pnpm --filter @web/server exec prisma generate
```

Example: `git worktree add ../web-6 -b riley/6-vibe-slot`.

## 5. Ojas only: MongoDB Atlas

The human does this in the browser. Walk them through it one step at a
time:

1. Go to cloud.mongodb.com and create a free **M0** cluster. Provider AWS,
   region N. Virginia (us-east-1).
2. **Database Access:** create a user. The password should use letters and
   numbers only.
3. **Network Access:** add `0.0.0.0/0`.
4. **Connect → Drivers:** copy the connection string and add `/web` before
   the `?`.
5. They paste it to you. You write it into `apps/server/.env` in **their
   worktree** as `DATABASE_URL=...`, starting from `.env.example`.
   **Never commit it.**
6. Remind them to DM the string to Riley and Andy.

## 6. GCP OAuth Setup

The human does this in the browser (Google Cloud Console). Walk them through it:
1. Create an OAuth client (Web application type).
2. Add the deployed callback URL (e.g. `https://your-domain.com/calendar/google/callback`).
3. Set the Consent screen to Testing mode and add the team as test users.
   **Note:** refresh tokens expire after 7 days in Testing mode.
4. Copy the Client ID and Client Secret, and write them into `apps/server/.env` as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

## 7. Hand off

Stop here. Tell the human, using their actual path:

> Open a **new** agent session inside `..\web-<n>` (not in `web`) and
> just say **"go"**. It will read the branch name, pull issue #<n> from
> GitHub, and show you a 5-line plan before building.

Finish with a short summary: what's installed, which worktrees exist, and
what the human does next.
