# Workflow

How an agent session goes from issue to merged PR. The principles live in
[`AGENTS.md`](../AGENTS.md); this page has the details.

## Your session, step by step

Your human has already made a git worktree for you on a branch named
`<name>/<issue#>-<slug>`. Work only in that folder.

1. **Get the issue.** Your human pasted it, or run
   `gh issue view <n> --repo ThatsORA/web`. No issue number? Stop and ask.
   Don't invent work.
2. **Sync:** `git pull --rebase origin main`.
3. **Read** the `wiki/plan.md` sections the issue links to, the lanes and
   scaffold map in [`codebase.md`](codebase.md), and the parts of
   [`invariants.md`](invariants.md) your issue touches. Check which lane
   the issue belongs to; edit only files in that lane.
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

## Definition of done

- The issue's acceptance criteria pass.
- `pnpm -r typecheck` and `pnpm -r test` pass locally, and CI is green.
- Pure logic (matching, vibe/slot, scoring, splits, resolution) has unit
  tests. The vibe/slot cases in `wiki/plan.md` §4 are required, verbatim.
- No `any` at a contract boundary. Request and response bodies are parsed
  with the zod schemas from `packages/contract`.
- The PR description says what you changed, how you tested it, and
  anything you stubbed.

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
- **Database is MongoDB Atlas** (a shared cluster). There are no
  migrations. Only Ojas's agent runs `pnpm --filter @web/server db:push`,
  and only on a schema issue. Everyone else only runs `prisma generate`.
