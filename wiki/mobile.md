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

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. SDK 57 `expo-calendar` requires a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Demo iPhones without a paid Apple Developer membership

Use the team's Mac with Xcode. A free Apple Account supports local on-device
testing through Xcode; it does not support EAS ad hoc distribution. In Xcode,
sign in under Settings → Accounts and select the Personal Team for signing.
Then, for each of the three iPhones:

1. Connect the phone to the Mac, trust the computer, and enable iOS Developer
   Mode if prompted.
2. From `apps/mobile`, run `pnpm exec expo run:ios --device` and select that
   phone. Expo generates `ios/` and installs the development build. If signing
   needs attention, open the generated project in Xcode and select the Personal
   Team under Signing & Capabilities, then retry.
3. Start Metro with the reachable backend URL, for example
   `EXPO_PUBLIC_API_URL=https://api.example.com pnpm exec expo start --dev-client --tunnel`
   (replace the example URL with the deployed backend).
   The phone cannot use `localhost` to reach the server on the Mac.

Repeat installation for each phone. Check granted and denied calendar
permission, the synced-count callout, and foreground resync after 15 minutes.
Do not commit the generated `ios/` directory.
