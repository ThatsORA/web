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

Stack: Expo (React Native) · Express + Socket.io · Postgres/Prisma · Places
API (New) · Routes API · Gemini. The code scaffold lands at hour 0.
