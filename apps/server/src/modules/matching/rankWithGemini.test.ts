import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../env";
import type { RankedGroupSlot } from "./candidates";
import { matchCandidateId, matchRankingFacts, rankWithGemini, validateMatchRanking } from "./rankWithGemini";

const NOW = new Date("2026-09-26T12:00:00Z");
const originalEnv = {
  DEMO_MODE: env.DEMO_MODE,
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  GEMINI_TIMEOUT_MS: env.GEMINI_TIMEOUT_MS,
};

function candidate(groupKey: string, startHours: number, score: number): RankedGroupSlot {
  const memberIds = [`${groupKey}-alice`, `${groupKey}-bob`, `${groupKey}-casey`];
  const start = new Date(NOW.getTime() + startHours * 3_600_000);
  return {
    group: {
      groupKey,
      memberIds,
      memberTimezones: Object.fromEntries(memberIds.map((id) => [id, "America/New_York"])),
      sourceGroupId: null,
    },
    slot: {
      start,
      end: new Date(start.getTime() + 2 * 3_600_000),
      vibe_tag: "dinner",
      durationMinutes: 120,
    },
    closeness: score,
    daysSinceLastHangout: 8,
    staleness: 8 / 14,
    soonness: 1 - startHours / 168,
    score,
  };
}

function geminiReply(ranking: unknown): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ ranking }) }] } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  env.DEMO_MODE = false;
  env.GEMINI_API_KEY = "test-key";
  env.GEMINI_TIMEOUT_MS = 50;
});

afterEach(() => {
  vi.unstubAllGlobals();
  env.DEMO_MODE = originalEnv.DEMO_MODE;
  env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;
  env.GEMINI_TIMEOUT_MS = originalEnv.GEMINI_TIMEOUT_MS;
});

describe("Gemini match ranking", () => {
  it("rejects foreign candidate IDs and duplicates", () => {
    const allowed = new Set(["a", "b"]);
    expect(validateMatchRanking({ ranking: [{ candidate_id: "foreign", reason: "No" }] }, allowed)).toBeNull();
    expect(validateMatchRanking({ ranking: [
      { candidate_id: "a", reason: "First" },
      { candidate_id: "a", reason: "Again" },
    ] }, allowed)).toBeNull();
  });

  it("re-ranks the deterministic shortlist, caches by its facts, and sends no member IDs", async () => {
    const first = candidate("group-one", 24, 0.9);
    const second = candidate("group-two", 30, 0.8);
    const firstId = matchCandidateId(first);
    const secondId = matchCandidateId(second);
    const fetchMock = vi.fn().mockResolvedValue(geminiReply([
      { candidate_id: secondId, reason: "Favorite overlap fits this dinner." },
      { candidate_id: firstId, reason: "Strong closeness and a sooner time." },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const favorites = new Map([
      [second.group.memberIds[0]!, [{ category: "restaurant" }]],
      [second.group.memberIds[1]!, [{ category: "restaurant" }]],
    ]);

    const ranked = await rankWithGemini([first, second], favorites);
    const cached = await rankWithGemini([first, second], favorites);

    expect(ranked.map((item) => item.group.groupKey)).toEqual(["group-two", "group-one"]);
    expect(ranked.map((item) => item.matchReason)).toEqual([
      "Favorite overlap fits this dinner.",
      "Strong closeness and a sooner time.",
    ]);
    expect(cached).toEqual(ranked);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).toContain('favorite_category_overlap');
    expect(body).toContain('restaurant');
    for (const memberId of [...first.group.memberIds, ...second.group.memberIds]) {
      expect(body).not.toContain(memberId);
    }
  });

  it("keeps deterministic order with null reasons when the key is missing", async () => {
    env.GEMINI_API_KEY = "";
    const candidates = [candidate("fallback-one", 20, 0.9), candidate("fallback-two", 24, 0.8)];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const ranked = await rankWithGemini(candidates, new Map());

    expect(ranked.map((item) => item.group.groupKey)).toEqual(["fallback-one", "fallback-two"]);
    expect(ranked.every((item) => item.matchReason === null)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back on timeout and in demo mode without a ranking fixture", async () => {
    const timed = candidate("timeout", 28, 0.7);
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    expect((await rankWithGemini([timed], new Map()))[0]?.matchReason).toBeNull();

    env.DEMO_MODE = true;
    env.GEMINI_API_KEY = "";
    expect((await rankWithGemini([candidate("demo-missing", 32, 0.6)], new Map()))[0]?.matchReason).toBeNull();
  });

  it("builds only the top ten aggregate fact records", () => {
    const candidates = Array.from({ length: 12 }, (_, index) => candidate(`fact-${index}`, index + 20, 1 - index / 20));
    const facts = matchRankingFacts(candidates, new Map());

    expect(facts).toHaveLength(10);
    expect(facts[0]).toMatchObject({
      candidate_id: matchCandidateId(candidates[0]!),
      member_count: 3,
      mean_closeness: 1,
      days_since_last_hangout: 8,
      vibe: "dinner",
    });
  });
});
