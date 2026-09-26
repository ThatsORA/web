const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

// ponytail: in-memory, single-instance limiter; use shared storage before running multiple instances.
export function createLoginLimiter() {
  const attempts = new Map<string, { failures: number; expiresAt: number }>();
  const key = (email: string, ip: string) => JSON.stringify([email.trim().toLowerCase(), ip]);
  function active(email: string, ip: string, now: number) {
    // Bound retained state to the active window, including abandoned email/IP pairs.
    for (const [entryKey, entry] of attempts) if (entry.expiresAt <= now) attempts.delete(entryKey);
    return attempts.get(key(email, ip));
  }
  return {
    retryAfter(email: string, ip: string, now = Date.now()): number {
      const entry = active(email, ip, now);
      return entry && entry.failures >= MAX_FAILURES ? Math.ceil((entry.expiresAt - now) / 1000) : 0;
    },
    failed(email: string, ip: string, now = Date.now()): void {
      const entry = active(email, ip, now) ?? { failures: 0, expiresAt: now + WINDOW_MS };
      entry.failures += 1;
      attempts.set(key(email, ip), entry);
    },
    succeeded(email: string, ip: string): void {
      attempts.delete(key(email, ip));
    },
  };
}

export const loginLimiter = createLoginLimiter();
