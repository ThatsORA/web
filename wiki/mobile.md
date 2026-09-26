# Mobile (Expo) notes

Applies to `apps/mobile/`. The root rules in [`AGENTS.md`](../AGENTS.md)
still apply and win on conflicts. Import API types from `@web/contract`.

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Push notifications need a development build

Remote push isn't available in Expo Go (Android lost it in SDK 53), so
`src/lib/usePushNotifications.ts` turns itself off there and the app runs as
usual; in dev the console says `Push notifications off: expo-go`. It also
stays off (`no-project-id`) until the app has an EAS project ID. To test push
on a phone:

1. `cd apps/mobile && npx eas-cli@latest init`: links the Expo project and
   writes `extra.eas.projectId` into `app.json`. Commit that once.
2. `npx expo install expo-dev-client`, on your own branch only. Keep it off
   `main`: with it installed, `npx expo start` opens the dev build instead of
   Expo Go (`npx expo start --go` switches back).
3. `npx eas-cli@latest build --profile development --platform android` (or
   `ios`; register the iPhone first with `npx eas-cli@latest device:create`).
   The `development` profile is in `apps/mobile/eas.json`. Android also needs
   FCM V1 credentials in the Expo project; on iOS, `eas build` offers to make
   the APNs key.
4. Install the build, then `npx expo start --dev-client`. Sign in; the
   permission prompt comes when the Hangouts feed first opens.
5. Send a test with the [Expo push tool](https://expo.dev/notifications) using
   the token from `PUT /me/push-token`, with data `{"event_id": "<uuid>"}`.
   Tapping it opens Hangouts scrolled to that event.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. SDK 57 includes `expo-calendar/legacy` in Expo Go; the class-based `expo-calendar` API requires a development build.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
