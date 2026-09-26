// DEMO_MODE: replay recorded Google/Gemini responses from apps/server/fixtures/.
// Fixtures are keyed by API + vibe; a missing key falls back to the most
// recent fixture for that API. Every external call goes through withFixture().
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { env } from "../env";

const FIXTURES_DIR = join(import.meta.dirname, "..", "..", "fixtures");

export type FixtureApi = "places" | "place-details" | "routes" | "gemini" | "gemini-rank" | "google-freebusy";

export async function withFixture<T>(api: FixtureApi, key: string, live: () => Promise<T>): Promise<T> {
  if (!env.DEMO_MODE) return live();
  const exact = join(FIXTURES_DIR, api, `${key}.json`);
  if (existsSync(exact)) return JSON.parse(readFileSync(exact, "utf8")) as T;
  const dir = join(FIXTURES_DIR, api);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
  const latest = files.at(-1);
  if (!latest) throw new Error(`DEMO_MODE: no fixtures recorded for ${api}`);
  return JSON.parse(readFileSync(join(dir, latest), "utf8")) as T;
}
