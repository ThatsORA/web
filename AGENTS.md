# AGENTS.md

Six agents (Claude, Gemini, Codex) build Web in parallel during a 36-hour
hackathon. This file is only the principles. Everything else is in
[`wiki/`](wiki/README.md), and [`wiki/plan.md`](wiki/plan.md) is the source
of truth: if anything disagrees with it, the plan wins. Flag the mismatch
in your PR.

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
- **Invariants are hard rules.** Time, privacy, money, Google APIs, the AI
  boundary and keys all have rules, and breaking one fails review.

## Read before coding

**Opened in the main `web` folder and asked to set someone up?** Follow
[`wiki/setup.md`](wiki/setup.md) and don't write feature code.


| Page | What's in it |
| --- | --- |
| [`wiki/plan.md`](wiki/plan.md) | Demo script, scope, schema, API contract, pipeline |
| [`wiki/workflow.md`](wiki/workflow.md) | Session steps, commands, branches and PRs, definition of done |
| [`wiki/codebase.md`](wiki/codebase.md) | Scaffold map and the lanes table |
| [`wiki/invariants.md`](wiki/invariants.md) | Hard invariants, pinned versions and gotchas |
| [`wiki/mobile.md`](wiki/mobile.md) | Expo SDK 57 rules for `apps/mobile/` |
| [`wiki/setup.md`](wiki/setup.md) | Onboarding a teammate: tools, gh login, worktrees, Atlas, handoff |
