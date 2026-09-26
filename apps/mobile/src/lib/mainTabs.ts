// Owner: Andy — the (main) bottom tab bar, as data. Pure, no React Native.
// `name` is the route file in src/app/(main)/ (other lanes link to these, e.g. /(main)/friends).
import type { AndroidSymbol, SFSymbol } from "expo-symbols";

export type MainTab = {
  name: "index" | "friends" | "squads" | "you";
  title: string;
  /** SF Symbol on iOS, Material Symbol on Android/web (both ship in Expo Go via expo-symbols). */
  icon: { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };
};

/** In tab-bar order. The first one is the initial tab after onboarding. */
export const MAIN_TABS: readonly MainTab[] = [
  { name: "index", title: "Hangouts", icon: { ios: "calendar", android: "calendar_month", web: "calendar_month" } },
  { name: "friends", title: "Friends", icon: { ios: "person.2", android: "group", web: "group" } },
  { name: "squads", title: "Squads", icon: { ios: "person.3", android: "groups", web: "groups" } },
  { name: "you", title: "You", icon: { ios: "person.crop.circle", android: "account_circle", web: "account_circle" } },
];

/** Routes in (main) that are not tabs: they stay routable but never get a tab-bar button. */
export const HIDDEN_MAIN_ROUTES = ["card-states"] as const;
