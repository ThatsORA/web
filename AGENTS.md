# AGENTS.md

Six agents (Claude, Gemini, Codex) build Web in parallel during a 36-hour
hackathon. This file is only the principles. Everything else is in
[`wiki/`](wiki/README.md), and [`wiki/plan.md`](wiki/plan.md) is the source
of truth: if anything disagrees with it, the plan wins. Flag the mismatch
in your PR.

## Start here: work out where you are (every session, before anything else)

Your human may just say "hi" or "go". Don't wait for instructions. Work
out the situation yourself, tell them in two or three lines what you
found, then act.

**1. Who is your human?** Run `gh api user --jq .login` (fallback:
`git config user.email`) and map the result:

| Handle | Person | Lane |
| --- | --- | --- |
| `andydo4` | Andy | shell, onboarding, event card, demo |
| `rileyh6` | Riley | availability, matching, venues, mobility |
| `TheRealOP` | Ojas | identity, social graph, voting, AI, schema |

If `gh` is missing or not logged in, or the handle isn't listed, ask
which of the three they are and continue. [`wiki/setup.md`](wiki/setup.md)
§1 covers the `gh` fix.

**2. Where are you?** Run `git branch --show-current` and
`git worktree list`.

- **Branch like `riley/6-vibe-slot`** → your issue is **#6**. Run
  `gh issue view 6 --repo ThatsORA/web` and follow
  [`wiki/workflow.md`](wiki/workflow.md). If that issue is already
  closed, or its PR is merged, say so and offer to set up their next
  issue instead.
- **`main`, in the main clone** → **setup mode**. Follow
  [`wiki/setup.md`](wiki/setup.md): get their tools ready, pick their next
  issue, create its worktree, and hand off. Don't write feature code
  here.
- **Any other branch** → ask what it's for before touching anything.

**3. What's the team's state?** Check it live; don't trust anything
written down, because it goes stale within the hour.

- `gh issue view <n>`: read the issue's "Depends on" list, then run
  `gh issue view <dep> --json state` for each dependency. If a dependency
  isn't closed, stub it behind the contract type and say so.
- `gh pr list --repo ThatsORA/web`: open PRs (don't duplicate work in
  flight).
- `gh issue view 16 --repo ThatsORA/web`: the hour-8 checkpoint and what
  it's waiting on.

Then report, for example: *"You're Riley, on issue #6 (free windows +
vibe/slot). It doesn't need the database, so #1 not being merged doesn't
block it. Here's my 5-line plan…"*

## How we build

- **YAGNI.** Build only what your issue's acceptance criteria and the demo
  script need. No speculative options, abstractions or "while I'm here"
  features.
- **KISS.** Take the simplest thing that works. Plain functions over
  frameworks, and a small amount of duplication over the wrong abstraction.
- **Demo first.** Every task serves the demo script in the plan. If it
  doesn't, it's stretch work or out of scope.
- **One issue, one branch, one small PR.** Don't start without an issue
  that has acceptance criteria. If there isn't one, stop and ask.
- **Stay in your lane.** Edit only paths your owner holds. Calling across
  lanes is fine; editing across lanes isn't. If you're blocked, stub it
  behind the contract type, open an issue for the owner, and keep going.
- **Contract first.** `@web/contract` defines every shape that crosses a
  boundary. Import from it, parse with its zod schemas, and never copy a
  type locally.
- **Extend the scaffold, don't rebuild it.** The routes, helpers and
  clients already exist. Replace stubs and reuse the shared helpers.
- **Deterministic core, AI at the edge.** The logic is pure,
  unit-tested TypeScript. Gemini is called in one place, and it always has
  a fallback.
- **Test the pure logic.** `foo.ts` gets a `foo.test.ts` next to it.
  `pnpm -r typecheck && pnpm -r test` must pass before you push.
- **Verify, don't recall.** Versions are pinned and APIs move fast. Check
  the pinned docs instead of trusting memory, and don't upgrade anything.
- **On-system UI.** Screens use `src/ui` components and theme tokens only:
  no raw hex, pixel sizes, font names or plain `<Text>`. See
  [`wiki/design.md`](wiki/design.md).
- **Invariants are hard rules.** Time, privacy, money, Google APIs, the AI
  boundary and keys all have rules, and breaking one fails review.

## Read before coding


| Page | What's in it |
| --- | --- |
| [`wiki/plan.md`](wiki/plan.md) | Demo script, scope, schema, API contract, pipeline |
| [`wiki/workflow.md`](wiki/workflow.md) | Session steps, commands, branches and PRs, definition of done |
| [`wiki/codebase.md`](wiki/codebase.md) | Scaffold map and the lanes table |
| [`wiki/invariants.md`](wiki/invariants.md) | Hard invariants, pinned versions and gotchas |
| [`wiki/mobile.md`](wiki/mobile.md) | Expo SDK 57 rules for `apps/mobile/` |
| [`wiki/design.md`](wiki/design.md) | Design system (Primer, violet): tokens, components, event-card look |
| [`wiki/setup.md`](wiki/setup.md) | Onboarding a teammate: tools, gh login, worktrees, Atlas, handoff |
