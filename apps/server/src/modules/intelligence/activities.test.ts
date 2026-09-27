import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../env";
import type { ActivityCandidate } from "../venues/discover";
import { describeActivities, fallbackActivity, pickActivities } from "./activities";

const places = [
  { place_id: "p1", name: "Movement Gym", primary_type: "sports_activity_location" },
  { place_id: "p2", name: "Pinstripes", primary_type: "bowling_alley" },
  { place_id: "p3", name: "Riverside Park", primary_type: "park" },
  { place_id: "p4", name: "Somewhere", primary_type: null },
];

describe("fallbackActivity", () => {
  it("labels from the primary type with 90 minutes", () => {
    expect(fallbackActivity("bowling_alley")).toEqual({ activity: "Bowling alley", typical_minutes: 90 });
    expect(fallbackActivity(null)).toEqual({ activity: "Hangout", typical_minutes: 90 });
  });
});

describe("describeActivities", () => {
  const original = { GEMINI_API_KEY: env.GEMINI_API_KEY, GEMINI_TIMEOUT_MS: env.GEMINI_TIMEOUT_MS, DEMO_MODE: env.DEMO_MODE };
  let reply: () => Promise<Response>;
  const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => reply());
  const gemini = (activities: unknown) => async () =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ activities }) }] } }] }));

  beforeEach(() => {
    env.DEMO_MODE = false;
    env.GEMINI_API_KEY = "test-key";
    env.GEMINI_TIMEOUT_MS = 50;
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    Object.assign(env, original);
    vi.unstubAllGlobals();
  });

  it("makes one call with a JSON schema; keeps valid entries, drops unknown ids, falls back on bad ones", async () => {
    reply = gemini([
      { place_id: "p1", activity: " Bouldering ", typical_minutes: 120 },
      { place_id: "p2", activity: "x".repeat(41), typical_minutes: 90 }, // label too long
      { place_id: "p3", activity: "Sunset walk", typical_minutes: 300 }, // too long a visit
      { place_id: "ghost", activity: "Karaoke", typical_minutes: 60 }, // not an input place
    ]);
    const out = await describeActivities(places);

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.generationConfig.responseSchema.properties.activities.items.required)
      .toEqual(["place_id", "activity", "typical_minutes"]);
    expect(body.contents[0].parts[0].text).toContain('"place_id":"p1","name":"Movement Gym"');
    expect(Object.fromEntries(out)).toEqual({
      p1: { activity: "Bouldering", typical_minutes: 120 },
      p2: { activity: "Bowling alley", typical_minutes: 90 },
      p3: { activity: "Park", typical_minutes: 90 },
      p4: { activity: "Hangout", typical_minutes: 90 },
    });
  });

  it("falls back for every place when the call fails or returns junk", async () => {
    const fallback = Object.fromEntries(places.map((p) => [p.place_id, fallbackActivity(p.primary_type)]));
    reply = async () => new Response("err", { status: 500 });
    expect(Object.fromEntries(await describeActivities(places))).toEqual(fallback);
    reply = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }));
    expect(Object.fromEntries(await describeActivities(places))).toEqual(fallback);
  });

  it("times out and falls back", async () => {
    reply = () => new Promise((_, reject) =>
      fetchMock.mock.calls.at(-1)![1]!.signal!.addEventListener("abort", () => reject(new Error("aborted"))));
    const out = await describeActivities(places);
    expect(out.get("p1")).toEqual({ activity: "Sports activity location", typical_minutes: 90 });
  });

  it("skips the call without a key", async () => {
    env.GEMINI_API_KEY = "";
    expect((await describeActivities(places)).get("p2")).toEqual({ activity: "Bowling alley", typical_minutes: 90 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pickActivities", () => {
  const c = (place_id: string, activity: string, route_score: number): ActivityCandidate => ({
    place_id, name: place_id, lat: 0, lng: 0, primary_type: null, price_level: null, rating: null, user_rating_count: null,
    travel_minutes: {}, max_travel_min: route_score, route_score, activity,
    starts_at: "2026-10-01T22:30:00.000Z", ends_at: "2026-10-02T00:00:00.000Z",
  });

  it("takes the 3 best by commute with distinct activity labels", () => {
    const picks = pickActivities([c("e", "Museum", 50), c("a", "Tacos", 10), c("b", "tacos", 12), c("d", "Bouldering", 30), c("f", "Karaoke", 40)]);
    expect(picks.map((p) => p.place_id)).toEqual(["a", "d", "f"]);
  });

  it("returns fewer than 3 when there aren't 3 distinct labels", () => {
    expect(pickActivities([c("a", "Tacos", 10), c("b", "Tacos", 12), c("d", "Bouldering", 30)])).toHaveLength(2);
  });
});
