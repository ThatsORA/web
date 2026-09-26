// Owner: Riley — Push notifications via Expo Push API.
// Thin payloads: data: { event_id }. Bodies never leak votes or ghost passes.
import { prisma } from "../lib/prisma";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushNotificationMessage {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: { event_id: string };
}

export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
    [key: string]: unknown;
  };
}

export interface ExpoPushResponse {
  data?: ExpoPushTicket[];
  errors?: Array<{ code: string; message: string }>;
}

export function formatEventCreatedBody(details?: { startsAt?: Date; vibeTag?: string; timezone?: string }): string {
  if (!details?.startsAt) {
    return "New hangout idea: vote on your options!";
  }
  const date = new Date(details.startsAt);
  if (isNaN(date.getTime())) {
    return "New hangout idea: vote on your options!";
  }
  const timeZone = details.timezone || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    const weekday = get("weekday");
    const minute = get("minute");
    const hour = get("hour");
    const period = get("dayPeriod").toLowerCase();
    const timeStr = minute === "00" ? `${hour}${period}` : `${hour}:${minute}${period}`;
    const vibeStr = details.vibeTag ? details.vibeTag.replace(/_/g, " ") : "";

    if (weekday && timeStr && vibeStr) {
      return `New hangout idea: ${weekday} ${timeStr} ${vibeStr}`;
    }
    if (weekday && timeStr) {
      return `New hangout idea: ${weekday} ${timeStr}`;
    }
  } catch {
    // If timezone is invalid fallback gracefully
  }
  return "New hangout idea: vote on your options!";
}

export function buildEventCreatedMessage(
  eventId: string,
  details?: { startsAt?: Date; vibeTag?: string; timezone?: string },
): { title: string; body: string; data: { event_id: string } } {
  return {
    title: "New hangout idea",
    body: formatEventCreatedBody(details),
    data: { event_id: eventId },
  };
}

export function buildEventResolvedMessage(
  eventId: string,
  status: string,
): { title: string; body: string; data: { event_id: string } } {
  if (status === "confirmed") {
    return {
      title: "Hangout Confirmed",
      body: "Your hangout has been confirmed!",
      data: { event_id: eventId },
    };
  }
  return {
    title: "Hangout Update",
    body: `Hangout status: ${status}`,
    data: { event_id: eventId },
  };
}

export function buildVenueChangedMessage(eventId: string): { title: string; body: string; data: { event_id: string } } {
  return {
    title: "Venue Changed",
    body: "The venue for your hangout has been updated.",
    data: { event_id: eventId },
  };
}

async function sendToUserTokens(
  userIds: string[],
  content: { title: string; body: string; data: { event_id: string } },
): Promise<void> {
  if (!userIds || userIds.length === 0) return;

  try {
    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });

    if (tokens.length === 0) return;

    // Deduplicate tokens
    const uniqueTokens = Array.from(new Set(tokens.map((t) => t.token)));
    if (uniqueTokens.length === 0) return;

    const messages: PushNotificationMessage[] = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: content.title,
      body: content.body,
      data: content.data,
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error(`Expo push API returned HTTP ${response.status}`);
      return;
    }

    const payload = (await response.json().catch(() => null)) as ExpoPushResponse | null;
    if (!payload?.data || !Array.isArray(payload.data)) {
      return;
    }

    const expiredTokens: string[] = [];
    for (let i = 0; i < payload.data.length; i++) {
      const ticket = payload.data[i];
      if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        const expiredToken = messages[i]?.to;
        if (expiredToken) {
          expiredTokens.push(expiredToken);
        }
      }
    }

    if (expiredTokens.length > 0) {
      await prisma.pushToken.deleteMany({
        where: { token: { in: expiredTokens } },
      }).catch((err) => {
        console.error("Failed to delete expired push tokens:", err);
      });
    }
  } catch (err) {
    console.error("Push notification error:", err);
  }
}

export async function pushVenueChanged(userIds: string[], eventId: string): Promise<void> {
  try {
    await sendToUserTokens(userIds, buildVenueChangedMessage(eventId));
  } catch (err) {
    console.error("pushVenueChanged failed:", err);
  }
}

export async function pushEventCreated(
  userIds: string[],
  eventId: string,
  details?: { startsAt?: Date; vibeTag?: string; timezone?: string },
): Promise<void> {
  try {
    await sendToUserTokens(userIds, buildEventCreatedMessage(eventId, details));
  } catch (err) {
    console.error("pushEventCreated failed:", err);
  }
}

export async function pushEventResolved(userIds: string[], eventId: string, status: string): Promise<void> {
  try {
    await sendToUserTokens(userIds, buildEventResolvedMessage(eventId, status));
  } catch (err) {
    console.error("pushEventResolved failed:", err);
  }
}
