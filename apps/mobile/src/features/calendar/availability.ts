// Groups the caller's free windows by day for display, in the phone's local time
// (timeZone is only passed by tests). Pure, no React Native.
type Window = { starts_at: string; ends_at: string };

export function windowsByDay(windows: Window[], timeZone?: string): { day: string; times: string[] }[] {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const byDay = new Map<string, string[]>();
  for (const w of windows) {
    const key = day.format(new Date(w.starts_at));
    byDay.set(key, [...(byDay.get(key) ?? []), `${time.format(new Date(w.starts_at))} – ${time.format(new Date(w.ends_at))}`]);
  }
  return [...byDay].map(([day, times]) => ({ day, times }));
}
