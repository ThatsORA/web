import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurateContext, RankedVenue } from "@web/contract";
import { env } from "../../env";
vi.mock("node:fs", () => ({ existsSync: vi.fn(), readFileSync: vi.fn(), readdirSync: vi.fn() }));
import { curateVenues, factsLine, fallbackOptions } from "./curateVenues";

const venue = (id: string, route_score: number, max: number): RankedVenue => ({
  place_id: id,
  name: id,
  lat: 25.757,
  lng: -80.375,
  primary_type: "restaurant",
  price_level: 2,
  rating: 4.6,
  user_rating_count: 120,
  travel_minutes: {},
  max_travel_min: max,
  route_score,
});

describe("fallbackOptions", () => {
  it("picks the 3 lowest route scores, ranked 1..3, no blurbs", () => {
    const out = fallbackOptions([venue("a", 56, 50), venue("b", 26, 20), venue("c", 30, 22), venue("d", 40, 30)]);
    expect(out.map((o) => o.place_id)).toEqual(["b", "c", "d"]);
    expect(out.map((o) => o.rank)).toEqual([1, 2, 3]);
    expect(out.every((o) => o.ai_blurb === null)).toBe(true);
  });

  it("formats the facts line", () => {
    expect(factsLine(venue("x", 20, 14))).toBe("★4.6 · $$ · max 14 min travel");
  });
});

describe("curateVenues", () => {
  // Distinct ids per test so the module-level cache never leaks between cases.
  const five = (p: string) => [1, 2, 3, 4, 5].map((n) => venue(`${p}${n}`, n * 10, n * 5));
  const ctx: CurateContext = { vibe_tag: "casual_hangout", slot_local: "Thu 6:30–8:30pm", favorite_counts: {} };
  const originalEnv = { GEMINI_API_KEY: env.GEMINI_API_KEY, GEMINI_TIMEOUT_MS: env.GEMINI_TIMEOUT_MS, DEMO_MODE: env.DEMO_MODE };
  let geminiReply: (signal?: AbortSignal | null) => Promise<Response>;
  const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) =>
    String(url).includes("generativelanguage")
      ? geminiReply(_init?.signal)
      : new Response(JSON.stringify({ reviews: [{ text: { text: "x".repeat(300) } }] })),
  );
  const reply = (options: unknown) =>
    async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ options }) }] } }] }));

  beforeEach(() => {
    env.DEMO_MODE = false;
    env.GEMINI_API_KEY = "test-key";
    env.GEMINI_TIMEOUT_MS = 50;
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    Object.assign(env, originalEnv);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses Gemini's picks and blurbs when valid, and caches them", async () => {
    geminiReply = reply([
      { place_id: "v3", blurb: "Cozy" },
      { place_id: "v1", blurb: "Quick bites" },
      { place_id: "v5", blurb: "Patio" },
    ]);
    const out = await curateVenues(five("v"), ctx);
    expect(out.map((o) => [o.place_id, o.rank, o.ai_blurb])).toEqual([
      ["v3", 1, "Cozy"],
      ["v1", 2, "Quick bites"],
      ["v5", 3, "Patio"],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(6); // 5 Place Details + 1 Gemini
    const prompt = JSON.parse(fetchMock.mock.calls[5]![1]!.body as string).contents[0].parts[0].text as string;
    expect(prompt).toContain(`"${"x".repeat(200)}"`); // snippets capped at 200 chars

    fetchMock.mockClear();
    expect(await curateVenues(five("v").reverse(), ctx)).toEqual(out);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back on a hallucinated place_id", async () => {
    geminiReply = reply([
      { place_id: "h1", blurb: "a" },
      { place_id: "h2", blurb: "b" },
      { place_id: "made-up", blurb: "c" },
    ]);
    expect(await curateVenues(five("h"), ctx)).toEqual(fallbackOptions(five("h")));
  });

  it("falls back on duplicate place_ids", async () => {
    geminiReply = reply([
      { place_id: "d1", blurb: "a" },
      { place_id: "d1", blurb: "b" },
      { place_id: "d2", blurb: "c" },
    ]);
    expect(await curateVenues(five("d"), ctx)).toEqual(fallbackOptions(five("d")));
  });

  it("falls back on a blurb over 90 chars", async () => {
    geminiReply = reply([
      { place_id: "b1", blurb: "a".repeat(91) },
      { place_id: "b2", blurb: "b" },
      { place_id: "b3", blurb: "c" },
    ]);
    expect(await curateVenues(five("b"), ctx)).toEqual(fallbackOptions(five("b")));
  });

  it("falls back when Gemini times out", async () => {
    geminiReply = (signal) => new Promise<Response>((_, reject) => {
      signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
    });
    expect(await curateVenues(five("t"), ctx)).toEqual(fallbackOptions(five("t")));
  });

  it("replays fixtures without a Gemini key or live fetch", async () => {
    env.DEMO_MODE = true;
    env.GEMINI_API_KEY = "";
    const options = [1, 2, 3].map((n) => ({ place_id: `fixture${n}`, blurb: `Fixture ${n}` }));
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const read = vi.mocked(fs.readFileSync).mockImplementation((path) =>
      JSON.stringify(String(path).replace(/\\/g, "/").includes("/gemini/") ? { options } : { reviews: [] }),
    );

    const out = await curateVenues(five("fixture"), ctx);
    expect(out.map((o) => ({ place_id: o.place_id, blurb: o.ai_blurb }))).toEqual(options);
    expect(read).toHaveBeenCalledWith(expect.stringMatching(/[/\\]gemini[/\\]casual_hangout\.json$/), "utf8");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps the cache at 200 entries and refreshes recently used entries", async () => {
    const curate = async (n: number) => {
      const prefix = `lru-${n}-`;
      geminiReply = reply([1, 2, 3].map((i) => ({ place_id: `${prefix}${i}`, blurb: "Cached" })));
      return curateVenues(five(prefix), ctx);
    };
    for (let n = 0; n < 200; n++) await curate(n);

    fetchMock.mockClear();
    await curate(0); // Refresh the oldest entry before inserting one more.
    expect(fetchMock).not.toHaveBeenCalled();
    await curate(200);
    expect(fetchMock).toHaveBeenCalledTimes(6);

    fetchMock.mockClear();
    await curate(0);
    await curate(2);
    expect(fetchMock).not.toHaveBeenCalled();
    await curate(1); // The least recently used entry was evicted.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
