import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurateContext, RankedVenue } from "@web/contract";
import { env } from "../../env";
vi.mock("node:fs", () => ({ existsSync: vi.fn(), readFileSync: vi.fn(), readdirSync: vi.fn() }));
import { curateVenues, factsLine, fallbackOptions, pickVenues } from "./curateVenues";

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

describe("pickVenues", () => {
  const top = [1, 2, 3, 4, 5].map((n) => venue(`p${n}`, n * 10, n * 5));
  const ids = (vs: RankedVenue[]) => vs.map((v) => v.place_id);

  it("keeps the fits (P ≥ 0.5) and takes the top 3 by route_score", () => {
    expect(ids(pickVenues(top, [0.2, 0.9, 0.5, 0.7, 0.6]))).toEqual(["p2", "p3", "p4"]);
  });

  it("tops up from the non-fits in route_score order when fewer than 3 fit", () => {
    expect(ids(pickVenues(top, [0.1, 0.3, 0.2, 0.8, 0.49]))).toEqual(["p4", "p1", "p2"]);
    expect(ids(pickVenues(top, [0, 0, 0, 0, 0]))).toEqual(["p1", "p2", "p3"]);
  });
});

describe("curateVenues", () => {
  // Distinct ids per test so the module-level cache never leaks between cases.
  const five = (p: string) => [1, 2, 3, 4, 5].map((n) => venue(`${p}${n}`, n * 10, n * 5));
  const ctx: CurateContext = { vibe_tag: "casual_hangout", slot_local: "Thu 6:30–8:30pm", favorite_counts: {} };
  const originalEnv = {
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GEMINI_TIMEOUT_MS: env.GEMINI_TIMEOUT_MS,
    DEMO_MODE: env.DEMO_MODE,
    JEV_API_KEY: env.JEV_API_KEY,
    LAYA_URL: env.LAYA_URL,
  };
  let geminiReply: (signal?: AbortSignal | null) => Promise<Response>;
  let fitProbs: number[] | null; // null = the decision call fails
  const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    if (String(url).includes("generativelanguage")) return geminiReply(_init?.signal);
    if (String(url).includes("systemone")) {
      if (!fitProbs) return new Response("down", { status: 503 });
      const answers = Object.fromEntries(fitProbs.map((a, i) => [
        `fit_${i}`,
        { type: "choice", choice: a >= 0.5 ? "A" : "B", confidence: 0.5, probabilities: { A: a, B: 1 - a } },
      ]));
      return new Response(JSON.stringify({ model: "jev-1.13.0", answers }));
    }
    return new Response(JSON.stringify({ reviews: [{ text: { text: "x".repeat(300) } }] }));
  });
  const reply = (options: unknown, match_reason = "Easy weeknight catch-up") =>
    async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ options, match_reason }) }] } }] }));
  const blurbs = (ids: string[]) => reply(ids.map((place_id) => ({ place_id, blurb: `Blurb ${place_id}` })));
  const bodyOf = (url: string) => JSON.parse(fetchMock.mock.calls.find(([u]) => String(u).includes(url))![1]!.body as string);

  beforeEach(() => {
    env.DEMO_MODE = false;
    env.GEMINI_API_KEY = "test-key";
    env.GEMINI_TIMEOUT_MS = 50;
    env.JEV_API_KEY = "jev-key";
    env.LAYA_URL = "";
    fitProbs = [0.2, 0.9, 0.1, 0.8, 0.7]; // fits: 2, 4, 5
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    Object.assign(env, originalEnv);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("filters with one decision call, then Gemini writes blurbs + match reason; caches the result", async () => {
    geminiReply = blurbs(["v2", "v4", "v5"]);
    const out = await curateVenues(five("v"), ctx);
    expect(out.options.map((o) => [o.place_id, o.rank, o.ai_blurb])).toEqual([
      ["v2", 1, "Blurb v2"],
      ["v4", 2, "Blurb v4"],
      ["v5", 3, "Blurb v5"],
    ]);
    expect(out.matchReason).toBe("Easy weeknight catch-up");
    expect(fetchMock).toHaveBeenCalledTimes(7); // 5 Place Details + 1 decision + 1 Gemini

    const decision = bodyOf("systemone");
    expect(Object.keys(decision.questions)).toEqual(["fit_0", "fit_1", "fit_2", "fit_3", "fit_4"]);
    expect(decision.state.venues[0]).toEqual({ name: "v1", primary_type: "restaurant", reviews: ["x".repeat(200)] });
    expect(JSON.stringify(decision)).not.toContain("place_id");
    const prompt = bodyOf("generativelanguage").contents[0].parts[0].text as string;
    expect(prompt).toContain(`"${"x".repeat(200)}"`); // snippets capped at 200 chars
    expect(prompt).not.toContain('"v1"'); // only the 3 picks go to Gemini

    fetchMock.mockClear();
    expect(await curateVenues(five("v").reverse(), ctx)).toEqual(out);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the top 3 by route_score when the decision call fails", async () => {
    fitProbs = null;
    geminiReply = blurbs(["f1", "f2", "f3"]);
    const out = await curateVenues(five("f"), ctx);
    expect(out.options.map((o) => o.place_id)).toEqual(["f1", "f2", "f3"]);
    expect(out.options.map((o) => o.ai_blurb)).toEqual(["Blurb f1", "Blurb f2", "Blurb f3"]);
  });

  it("returns facts only and no match reason when Gemini fails, keeping the decision picks", async () => {
    geminiReply = async () => new Response("err", { status: 500 });
    const out = await curateVenues(five("g"), ctx);
    expect(out.matchReason).toBeNull();
    expect(out.options).toHaveLength(3);
    expect(out.options.map((o) => [o.place_id, o.ai_blurb, o.facts_line])).toEqual(
      ["g2", "g4", "g5"].map((id) => [id, null, "★4.6 · $$ · max " + Number(id[1]) * 5 + " min travel"]),
    );
  });

  it("returns exactly 3 facts-only options when both models fail", async () => {
    fitProbs = null;
    geminiReply = async () => new Response("err", { status: 500 });
    expect(await curateVenues(five("n"), ctx)).toEqual({ options: fallbackOptions(five("n")), matchReason: null });
  });

  it("skips Gemini without a key", async () => {
    env.GEMINI_API_KEY = "";
    const out = await curateVenues(five("k"), ctx);
    expect(out.options.map((o) => o.place_id)).toEqual(["k2", "k4", "k5"]);
    expect(out.matchReason).toBeNull();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("generativelanguage"))).toBe(false);
  });

  it("drops Gemini text on a hallucinated place_id", async () => {
    geminiReply = blurbs(["h2", "h4", "made-up"]);
    expect((await curateVenues(five("h"), ctx)).options.every((o) => o.ai_blurb === null)).toBe(true);
  });

  it("drops Gemini text on duplicate place_ids", async () => {
    geminiReply = blurbs(["d2", "d2", "d4"]);
    expect((await curateVenues(five("d"), ctx)).matchReason).toBeNull();
  });

  it("drops Gemini text on a blurb or match reason over 90 chars", async () => {
    geminiReply = reply([{ place_id: "b2", blurb: "a".repeat(91) }, { place_id: "b4", blurb: "b" }, { place_id: "b5", blurb: "c" }]);
    expect((await curateVenues(five("b"), ctx)).matchReason).toBeNull();
    geminiReply = reply(["m2", "m4", "m5"].map((place_id) => ({ place_id, blurb: "ok" })), "r".repeat(91));
    expect((await curateVenues(five("m"), ctx)).matchReason).toBeNull();
  });

  it("drops Gemini text when Gemini times out", async () => {
    geminiReply = (signal) => new Promise<Response>((_, reject) => {
      signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
    });
    const out = await curateVenues(five("t"), ctx);
    expect(out.options.map((o) => [o.place_id, o.ai_blurb])).toEqual([["t2", null], ["t4", null], ["t5", null]]);
  });

  it("replays fixtures without keys or live fetch", async () => {
    env.DEMO_MODE = true;
    env.GEMINI_API_KEY = "";
    env.JEV_API_KEY = "";
    const options = [1, 2, 3].map((n) => ({ place_id: `fixture${n}`, blurb: `Fixture ${n}` }));
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const read = vi.mocked(fs.readFileSync).mockImplementation((path) =>
      JSON.stringify(/[/\\]gemini[/\\]/.test(String(path)) ? { options, match_reason: "Fixture reason" } : { reviews: [] }),
    );

    const out = await curateVenues(five("fixture"), ctx); // decision fixture is malformed → top 3
    expect(out.options.map((o) => ({ place_id: o.place_id, blurb: o.ai_blurb }))).toEqual(options);
    expect(out.matchReason).toBe("Fixture reason");
    expect(read).toHaveBeenCalledWith(expect.stringMatching(/[/\\]gemini[/\\]casual_hangout\.json$/), "utf8");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps the cache at 200 entries and refreshes recently used entries", async () => {
    const curate = async (n: number) => {
      const prefix = `lru-${n}-`;
      geminiReply = blurbs([2, 4, 5].map((i) => `${prefix}${i}`));
      return curateVenues(five(prefix), ctx);
    };
    for (let n = 0; n < 200; n++) await curate(n);

    fetchMock.mockClear();
    await curate(0); // Refresh the oldest entry before inserting one more.
    expect(fetchMock).not.toHaveBeenCalled();
    await curate(200);
    expect(fetchMock).toHaveBeenCalledTimes(7);

    fetchMock.mockClear();
    await curate(0);
    await curate(2);
    expect(fetchMock).not.toHaveBeenCalled();
    await curate(1); // The least recently used entry was evicted.
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });
});
