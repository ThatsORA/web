import { PutBusyBlocksRequest } from "@web/contract";
import type { z } from "zod";

export type SyncBody = z.infer<typeof PutBusyBlocksRequest>;
// Only these fields are ever read from native event objects.
export type CalendarInterval = { startDate: Date | string; endDate: Date | string; allDay: boolean; availability: string };
export function busyBlockPayload(events: readonly CalendarInterval[], start: Date, end: Date): SyncBody {
  const blocks = new Map<string, SyncBody["blocks"][number]>();
  for (const event of events) {
    if (event.allDay || event.availability === "free") continue;
    const s = Math.max(new Date(event.startDate).getTime(), start.getTime());
    const e = Math.min(new Date(event.endDate).getTime(), end.getTime());
    if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) continue;
    const block = { starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString() };
    blocks.set(`${block.starts_at}/${block.ends_at}`, block);
  }
  return PutBusyBlocksRequest.parse({ horizon_start: start.toISOString(), horizon_end: end.toISOString(), blocks: [...blocks.values()] });
}

export function createCalendarSync(deps: {
  permission(request: boolean): Promise<boolean>;
  read(start: Date, end: Date): Promise<CalendarInterval[]>;
  upload(body: SyncBody): Promise<{ stored: number }>;
  now?: () => number;
}) {
  let lastSync: number | null = null;
  let inFlight: Promise<number | null> | null = null;
  const now = deps.now ?? Date.now;
  function sync(requestPermission = false): Promise<number | null> {
    if (inFlight) return inFlight;
    if (!requestPermission && lastSync !== null && now() - lastSync <= 15 * 60_000) return Promise.resolve(null);
    inFlight = (async () => {
      if (!await deps.permission(requestPermission)) return null;
      const start = new Date(now());
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60_000);
      const events = await deps.read(start, end);
      const result = await deps.upload(busyBlockPayload(events, start, end));
      lastSync = now();
      return result.stored;
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  return { sync };
}
