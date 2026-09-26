// Owner: Riley — replace the caller's busy blocks inside a half-open horizon.
import { Router } from "express";
import { MyAvailabilityResponse, PutBusyBlocksRequest, PutBusyBlocksResponse, routes } from "@web/contract";
import { env } from "../../env";
import { requireAuth, type AuthedRequest } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { freeWindows } from "../matching/timeMath";
import { syncGoogleCalendar } from "./googleSync";

export const calendarRouter = Router();
calendarRouter.put(routes.busyBlocks, requireAuth, async (req, res) => {
  const parsed = PutBusyBlocksRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_busy_blocks" });
  const { horizon_start, horizon_end, blocks } = parsed.data;
  const start = new Date(horizon_start);
  const end = new Date(horizon_end);
  if (start >= end || blocks.some(block => {
    const s = new Date(block.starts_at), e = new Date(block.ends_at);
    return s >= e || s < start || e > end;
  })) return res.status(400).json({ error: "invalid_busy_blocks" });
  const userId = (req as AuthedRequest).userId;
  const unique = [...new Map(blocks.map(block => {
    const startsAt = new Date(block.starts_at), endsAt = new Date(block.ends_at);
    return [`${startsAt.toISOString()}/${endsAt.toISOString()}`, { startsAt, endsAt }];
  })).values()];
  await prisma.$transaction(async tx => {
    const where = { userId, startsAt: { lt: end }, endsAt: { gt: start } };
    const existing = await tx.busyBlock.findMany({ where });
    await tx.busyBlock.deleteMany({ where });
    // Preserve portions outside the replaced horizon, including seeded blocks.
    const tails = existing.flatMap(block => {
      const base = { userId, source: block.source, syncedAt: block.syncedAt };
      return [
        ...(block.startsAt < start ? [{ ...base, startsAt: block.startsAt, endsAt: start }] : []),
        ...(block.endsAt > end ? [{ ...base, startsAt: end, endsAt: block.endsAt }] : []),
      ];
    });
    const data = [...tails, ...unique.map(block => ({ ...block, userId, source: "device_calendar" as const }))];
    if (data.length) await tx.busyBlock.createMany({ data });
  });
  return res.json(PutBusyBlocksResponse.parse({ stored: unique.length }));
});

// The caller's own free windows, computed exactly as the matcher does (same freeWindows + env config).
calendarRouter.get(routes.myAvailability, requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const [user, openEvents] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { busyBlocks: true } }),
    prisma.event.findMany({
      where: { status: { in: ["voting", "confirmed"] }, participants: { some: { userId } } },
    }),
  ]);
  if (!user) return res.status(404).json({ error: "user_not_found" });
  const windows = freeWindows([{
    id: user.id,
    timezone: user.timezone,
    busyBlocks: user.busyBlocks.map(block => ({ start: block.startsAt, end: block.endsAt })),
    openEvents: openEvents.map(event => ({ start: event.startsAt, end: event.endsAt })),
  }], new Date(), {
    busyPaddingMin: env.BUSY_PADDING_MIN,
    minLeadHours: env.MIN_LEAD_HOURS,
    horizonDays: env.MATCH_HORIZON_DAYS,
  });
  return res.json(MyAvailabilityResponse.parse({
    windows: windows.map(w => ({ starts_at: w.start.toISOString(), ends_at: w.end.toISOString() })),
  }));
});

calendarRouter.get(routes.googleCalendar, requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  
  return res.json({
    connected: conn?.status === "active",
    last_synced_at: conn?.lastSyncedAt?.toISOString() || null,
    revoked: conn?.status === "revoked",
  });
});

calendarRouter.post(routes.googleCalendarStart, requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const { redirect_uri } = req.body;
  const state = (await import("./crypto")).signState(userId, redirect_uri);
  const { env } = await import("../../env");
  
  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return res.json({ url });
});

calendarRouter.get(routes.googleCalendarCallback, async (req, res) => {
  const { code, state, error } = req.query;
  const { env } = await import("../../env");
  const { verifyState, encryptToken } = await import("./crypto");
  
  if (error || !code || !state || typeof code !== "string" || typeof state !== "string") {
    return res.redirect("rileyweb://google-connected?error=auth_failed");
  }

  let verifiedState;
  try {
    verifiedState = verifyState(state);
  } catch (e) {
    return res.redirect("rileyweb://google-connected?error=invalid_state");
  }

  const { userId, redirectUri } = verifiedState;
  const fallbackRedirect = redirectUri || "rileyweb://google-connected";
  const redirectUrlWith = (param: string) => fallbackRedirect.includes("?") ? `${fallbackRedirect}&${param}` : `${fallbackRedirect}?${param}`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) throw new Error("Token exchange failed");

    const tokenData = await tokenRes.json();
    if (!tokenData.refresh_token) throw new Error("No refresh token");

    const encryptedToken = encryptToken(tokenData.refresh_token);

    await prisma.googleCalendarConnection.upsert({
      where: { userId },
      update: {
        refreshTokenEnc: encryptedToken,
        status: "active",
        connectedAt: new Date(),
        scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
        lastError: null,
      },
      create: {
        userId,
        refreshTokenEnc: encryptedToken,
        status: "active",
        scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      },
    });

    void syncGoogleCalendar(userId).catch(e => console.error("Sync failed:", e));
    return res.redirect(redirectUrlWith("ok=1"));
  } catch (e) {
    console.error("Google OAuth callback error:", e);
    return res.redirect(redirectUrlWith("error=exchange_failed"));
  }
});

calendarRouter.delete(routes.googleCalendar, requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const { decryptToken } = await import("./crypto");

  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!conn) return res.json({ success: true });

  try {
    const token = decryptToken(conn.refreshTokenEnc);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-type": "application/x-www-form-urlencoded" }
    });
  } catch (e) {
    console.error("Failed to revoke Google token", e);
  }

  await prisma.$transaction(async tx => {
    await tx.googleCalendarConnection.delete({ where: { userId } });
    await tx.busyBlock.deleteMany({ where: { userId, source: "google_calendar" } });
  });

  return res.json({ success: true });
});

calendarRouter.post(routes.googleCalendarSync, requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  try {
    return res.json(await syncGoogleCalendar(userId));
  } catch (e) {
    console.error("Google sync route error:", e);
    return res.status(500).json({ error: "sync_failed" });
  }
});
