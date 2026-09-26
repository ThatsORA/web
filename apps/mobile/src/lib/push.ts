// Owner: Andy — push notifications (#79): the pure decisions plus the push-token API calls.
// The expo-notifications glue lives in usePushNotifications.ts, so this file stays testable.
import { DeletePushTokenRequest, Id, SavePushTokenRequest, routes } from "@web/contract";
import type { Href } from "expo-router";
import { z } from "zod";
import { api } from "./api";

export type PushSkipReason = "unsupported-platform" | "expo-go" | "no-project-id";

/**
 * Why this build can't register for remote push, or null when it can.
 * Expo Go is skipped on both platforms: Android lost remote push in SDK 53, and on iOS the
 * token would belong to Expo Go rather than Web. Getting an Expo push token needs the EAS projectId.
 */
export function pushSkipReason(env: {
  os: string;
  inExpoGo: boolean;
  projectId: string | undefined;
}): PushSkipReason | null {
  if (env.os !== "ios" && env.os !== "android") return "unsupported-platform";
  if (env.inExpoGo) return "expo-go";
  if (!env.projectId) return "no-project-id";
  return null;
}

/** The server's payload is `data: { event_id }` (#159). Anything else is ignored. */
export function eventIdFromPushData(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("event_id" in data)) return null;
  const parsed = Id.safeParse(data.event_id);
  return parsed.success ? parsed.data : null;
}

/** A tapped notification opens the Hangouts feed, scrolled to its event when it names one. */
export function feedHrefForPush(data: unknown): Href {
  const eventId = eventIdFromPushData(data);
  return eventId ? { pathname: "/(main)", params: { event: eventId } } : "/(main)";
}

const Ignored = z.unknown(); // PUT/DELETE /me/push-token answer 204

let registeredToken: string | null = null;

export async function savePushToken(token: string, platform: "ios" | "android"): Promise<void> {
  await api(routes.pushToken, Ignored, { method: "PUT", body: SavePushTokenRequest.parse({ token, platform }) });
  registeredToken = token;
}

/**
 * Call right before session.clear() on log out. api() builds the auth header synchronously,
 * so the DELETE still carries this session even though log out doesn't wait for it.
 * Best effort: a failure never blocks log out.
 */
export function unregisterPushToken(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return Promise.resolve();
  return api(routes.pushToken, Ignored, { method: "DELETE", body: DeletePushTokenRequest.parse({ token }) }).then(
    () => undefined,
    () => undefined,
  );
}
