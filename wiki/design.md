# Design system: Primer (violet edition)

The look for every screen in `apps/mobile`. It's adapted from Andy's Primer
system (TypeUI Contemporan style), with **electric violet** instead of
ultramarine, and translated from web to a phone app.

**The rule for agents: build screens from `src/ui` components and theme
tokens only.** Never use a raw hex color, a pixel size, a font name, or a
plain React Native `<Text>`. Plain `<Text>` silently falls back to the
system font. If a component you need doesn't exist, add it to `src/ui` (it's
Andy's lane, so open an issue if it isn't yours) instead of styling inline.

## Principles

1. **Violet frames, white works.** Full-bleed violet (`primary`) for hero
   moments: the welcome screen, and the event card's confirmed header
   (`<Card brand>`). Everything you read or act on sits on
   `surface`/`background` with 1px borders.
2. **Lime means "look here".** Only for new or urgent signals: the NEW tag
   on a fresh proposal, "Swapped" after "Change spot", a focus ring on
   violet. Text on lime is always `onLime` (dark in both modes). Never use
   lime as text on a light surface.
3. **Serif speaks, mono works.** Playfair Display for screen headlines and
   the event card's hero line (`Txt variant="display" | "headline"`).
   Geist Mono for everything else: labels, buttons, body copy, numbers.
4. **Exact, not soft.** 1px corners on every component (`radius.sm/md`).
   `radius.pill` is only for avatars and status dots. Borders, not
   shadows.
5. **Never color alone.** Status always carries a word or icon ("2 of 3
   responded", "Closed"), not just a tint.

## Tokens (`src/ui/theme.ts`)

| Group | Tokens |
| --- | --- |
| Surfaces | `background`, `surface`, `surfaceCard` (tinted), `surfaceMuted` |
| Lines | `border` (default 1px), `borderStrong` (inputs, emphasis) |
| Text | `heading`, `text` (body), `textMuted` (meta), `link` |
| Brand | `primary` `#6A00F4`, `primaryStrong` (pressed), `primarySoft`, `primarySofter`, `onPrimary` |
| Highlight | `lime` `#EDFF45`, `onLime` |
| Status | `info`, `success`, `warning`, `danger`, each with a `…Surface` |
| Space | `spacing.xs 4 · sm 8 · ms 12 · md 16 · lg 24 · xl 32 · xxl 48` |
| Shape | `radius.sm/md = 1`, `radius.pill = 999`, `touch = 44` |
| Type presets | `type.display`, `headline` (Playfair); `title`, `section`, `stat`, `body`, `label`, `small`, `eyebrow` (Geist Mono) |

Every text/background pair is at least 4.5:1 (WCAG AA) in light and dark.
`theme.test.ts` checks all of them, so **a new color pair must be added to
`TEXT_PAIRS`**, and CI will fail if it's below AA.

## Components (`src/ui`)

| Component | Use |
| --- | --- |
| `Txt` | All text. `variant` = type preset, `color` = palette key, `numeric` for times, counts and countdowns |
| `Screen` | A page: optional `eyebrow`, Playfair `title`, `subtitle`, and a pinned `footer` for the main action |
| `Button` | `primary` (violet), `secondary` (muted fill), `outline`, `ghost` (link). 44pt tall |
| `Card` | Bordered surface, 24pt padding. `tint` = `surfaceCard`, `brand` = violet band |
| `Chip` | Toggle tag (favorites, filters). Selected = violet fill |
| `Badge` | Status tag: `neutral`, `info`, `success`, `warning`, `danger`, or `new` (lime, uppercased) |
| `Callout` | Tinted message box with a thin tinted border |
| `TextField` | Label + input. 2px violet border on focus, red on error |

## The event card (demo steps 6–9)

- **Voting:** a `Card`.
  - Eyebrow: the vibe (`DINNER`). Headline in Playfair: "Thu · 6:30–8:30pm".
  - `Badge new` when it just arrived.
  - Three option rows, each with the venue name (`label`), its
    `facts_line` (`small`, `numeric`) and its AI blurb (`body`).
  - Vote = `Button primary`. Ghost Pass = `Button ghost`.
- **Waiting:** "2 of 3 responded" as a neutral `Badge` or `Txt numeric`.
  Never show who responded.
- **Confirmed:** `Card brand` header (white Playfair venue name on violet),
  then per-person travel times (`Txt numeric`) and the map pin.
  "Change spot" = `Button ghost` with the venue actions, never the main
  action. It names the next backup in a `Callout` and asks before changing
  it for everyone.
- **Swapped:** `Badge new` "Swapped". Use lime, because it's the "look
  here" moment.

## Writing tone

Concise, confident, friendly. Sentence case everywhere ("Share my
location"). Uppercase only in eyebrows. Say what happened and what to do
next.

## Don't

- Round corners past 1px (except avatars and dots), or add gradients or
  card shadows.
- Use lime as text on light surfaces, or for anything that isn't a
  highlight.
- Use Playfair in controls (buttons, chips, inputs), or mono for screen
  headlines.
- Hard-code a color, size or font anywhere outside `src/ui/theme.ts`.
