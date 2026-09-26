import {
  ExpoPushRequest,
  ExpoPushResponse,
  ExpoPushToken,
  type PushMessage,
  type VibeTag,
} from "@web/contract";
import { env } from "../env";
import { prisma } from "../lib/prisma";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_LIMIT = 100;
const PUSH_TIMEOUT_MS = 10_000;

export type PushEvent =
  | { kind: "created"; eventId: string; startsAt: Date; timezone: string; vibeTag: VibeTag }
  | { kind: "confirmed"; eventId: string }
  | { kind: "venue_changed"; eventId: string };

function localSlot(startsAt: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(startsAt);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("weekday")} ${part("hour")}:${part("minute")}${part("dayPeriod").toLowerCase()}`;
}

/** Build presentation text from event metadata only. Vote state never enters this boundary. */
export function buildPushMessage(event: PushEvent): PushMessage {
  if (event.kind === "created") {
    return {
      title: "New hangout idea",
      body: `New hangout idea: ${localSlot(event.startsAt, event.timezone)} ${event.vibeTag.replaceAll("_", " ")}`,
      data: { event_id: event.eventId },
    };
  }
  if (event.kind === "confirmed") {
    return {
      title: "Hangout confirmed",
      body: "Your hangout is confirmed. Open Web for details.",
      data: { event_id: event.eventId },
    };
  }
  return {
    title: "Venue changed",
    body: "Your hangout venue changed. Open Web for details.",
    data: { event_id: event.eventId },
  };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function sendBatch(tokens: readonly string[], message: PushMessage, fetcher: typeof fetch): Promise<void> {
  const messages = ExpoPushRequest.array().parse(tokens.map((to) => ({ to, ...message })));
  const response = await fetcher(EXPO_PUSH_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Expo Push failed with HTTP ${response.status}`);

  const parsed = ExpoPushResponse.parse(await response.json());
  const tickets = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  if (tickets.length !== tokens.length) throw new Error("Expo Push returned the wrong number of tickets");
  const unregistered = tickets.flatMap((ticket, index) =>
    ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered" ? [tokens[index]!] : [],
  );
  if (unregistered.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: unregistered } } });
  }
  const providerErrorCodes = tickets.flatMap((ticket) =>
    ticket.status === "error" && ticket.details?.error !== "DeviceNotRegistered"
      ? [ticket.details?.error ?? "unknown"]
      : [],
  );
  if (providerErrorCodes.length > 0) {
    const codes = [...new Set(providerErrorCodes)];
    throw new Error(`Expo Push rejected ${providerErrorCodes.length} notification(s): ${codes.join(", ")}`);
  }
}

export async function sendPushToUsers(
  userIds: readonly string[],
  message: PushMessage,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  // Demo mode targets Expo Go and sockets; never call the live push service during rehearsals or fixture tests.
  if (env.DEMO_MODE) return;
  if (userIds.length === 0) return;
  const rows = await prisma.pushToken.findMany({
    where: { userId: { in: [...new Set(userIds)] } },
    select: { token: true },
  });
  const invalid = rows.map(({ token }) => token).filter((token) => !ExpoPushToken.safeParse(token).success);
  if (invalid.length > 0) await prisma.pushToken.deleteMany({ where: { token: { in: invalid } } });
  const tokens = rows.map(({ token }) => token).filter((token) => ExpoPushToken.safeParse(token).success);
  const batches = chunks(tokens, EXPO_BATCH_LIMIT);
  const results = await Promise.allSettled(batches.map((tokens) => sendBatch(tokens, message, fetcher)));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
}

export async function pushEventCreated(
  userIds: readonly string[],
  event: { id: string; startsAt: Date; timezone: string; vibeTag: VibeTag },
): Promise<void> {
  await sendPushToUsers(userIds, buildPushMessage({
    kind: "created",
    eventId: event.id,
    startsAt: event.startsAt,
    timezone: event.timezone,
    vibeTag: event.vibeTag,
  }));
}

export async function pushEventConfirmed(userIds: readonly string[], eventId: string): Promise<void> {
  await sendPushToUsers(userIds, buildPushMessage({ kind: "confirmed", eventId }));
}

/** Riley's venue-change route should call this beside event:venue_changed. */
export async function pushVenueChanged(userIds: readonly string[], eventId: string): Promise<void> {
  await sendPushToUsers(userIds, buildPushMessage({ kind: "venue_changed", eventId }));
}
