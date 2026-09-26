import { prisma } from "../../lib/prisma";
import { env } from "../../env";
import { withFixture } from "../../lib/demoMode";
import { mergeIntervals } from "../matching/timeMath";
import { decryptToken } from "./crypto";

export async function syncGoogleCalendar(userId: string): Promise<{ success: boolean; revoked?: boolean; stored?: number }> {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { userId },
  });

  if (!connection) {
    return { success: false };
  }

  const refreshToken = decryptToken(connection.refreshTokenEnc);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) {
    const errorData = await tokenRes.json().catch(() => ({}));
    if (tokenRes.status === 400 && errorData.error === "invalid_grant") {
      await prisma.googleCalendarConnection.update({
        where: { userId },
        data: { status: "revoked", lastError: "invalid_grant" },
      });
      return { success: false, revoked: true };
    }
    throw new Error(`Failed to refresh token: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  const calendarListRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!calendarListRes.ok) {
    throw new Error(`Failed to list calendars: ${calendarListRes.status}`);
  }

  const calendarListData = await calendarListRes.json();
  const calendars = calendarListData.items || [];
  const calendarIds = calendars
    .filter((c: any) => c.accessRole !== "freeBusyReader")
    .map((c: any) => c.id);

  if (calendarIds.length === 0) {
    return { success: true, stored: 0 };
  }

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + env.MATCH_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const freeBusyRes = await withFixture("google-freebusy", userId, async () => {
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: horizonEnd.toISOString(),
        items: calendarIds.map((id: string) => ({ id })),
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to query freeBusy: ${res.status}`);
    }
    return res.json();
  });

  const rawIntervals: { start: Date; end: Date }[] = [];
  if (freeBusyRes.calendars) {
    for (const calId of Object.keys(freeBusyRes.calendars)) {
      const busyArr = freeBusyRes.calendars[calId].busy || [];
      for (const b of busyArr) {
        rawIntervals.push({ start: new Date(b.start), end: new Date(b.end) });
      }
    }
  }

  const merged = mergeIntervals(rawIntervals);

  await prisma.$transaction([
    prisma.busyBlock.deleteMany({
      where: {
        userId,
        source: "google_calendar",
        startsAt: { lt: horizonEnd },
        endsAt: { gt: now },
      },
    }),
    prisma.busyBlock.createMany({
      data: merged.map((m) => ({
        userId,
        source: "google_calendar",
        startsAt: m.start,
        endsAt: m.end,
      })),
    }),
    prisma.googleCalendarConnection.update({
      where: { userId },
      data: {
        lastSyncedAt: new Date(),
        status: "active",
        lastError: null,
      },
    }),
  ]);

  return { success: true, stored: merged.length };
}

export async function syncAllGoogleCalendars(): Promise<void> {
  const connections = await prisma.googleCalendarConnection.findMany({
    where: { status: "active" },
  });

  for (const conn of connections) {
    try {
      await syncGoogleCalendar(conn.userId);
    } catch (err) {
      console.error(`Failed to sync user ${conn.userId}`, err);
    }
  }
}
