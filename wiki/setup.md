# Setup: onboarding a teammate (instructions for agents)

Your human just cloned the repo and asked you to set them up. Follow these
steps in order. **Don't write any feature code in this session.** The goal
is to get their machine ready and hand them off to a fresh agent inside a
worktree.

## 0. Ask two things first

1. **Who are they?** (Andy, Riley or Ojas)
2. **What OS and shell?** On Windows PowerShell, chain commands with `;`,
   not `&&`.

| Person | GitHub handle | Starts with |
| --- | --- | --- |
| Andy | `andydo4` | #12, then #15 |
| Riley | `rileyh6` | #6, then #7 |
| Ojas | `TheRealOP` | #1, then #2 |

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

List their open issues:

```
gh issue list --repo ThatsORA/web --assignee <handle> --state open
```

Confirm the first one or two from the table above with them.

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

## 6. Hand off

Stop here. Tell the human to open a **new** agent session **inside
`../web-<n>`** (not in `web`) and paste this, with their issue number in
both places:

> Work on GitHub issue #<n> in ThatsORA/web. First read AGENTS.md and
> wiki/workflow.md and follow the session steps exactly. Then read the
> wiki/plan.md sections the issue links to. Tell me your plan in 5 lines or fewer, then build
> it. Stay in your lane, write the tests, and make
> `pnpm -r typecheck && pnpm -r test` pass. When you're done, push the
> branch and open a PR with "Closes #<n>".

Finish with a short summary: what's installed, which worktrees exist, and
what the human does next.
