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

## Where to look

Read only the pages and sections your task needs. Don't load the whole
wiki: it fills your context window with things you won't use.

| Page | Read it when |
| --- | --- |
| [`wiki/plan.md`](wiki/plan.md) | You need the spec. Read only the sections your issue links to. |
| [`wiki/workflow.md`](wiki/workflow.md) | You start a session, run a command, or open a PR |
| [`wiki/codebase.md`](wiki/codebase.md) | You need to know what already exists or who owns a path |
| [`wiki/invariants.md`](wiki/invariants.md) | Your change touches time, privacy, money, Google APIs, Gemini, keys or the DB |
| [`wiki/mobile.md`](wiki/mobile.md) | You're working in `apps/mobile/` |
