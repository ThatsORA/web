import { PatchMeRequest } from "@web/contract";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { budgetDraft, buildBudget, buildChangeEmailRequest, buildPrefsPatch, buildProfilePatch, profileErrorMessage, usernameProblem } from "./profile";

describe("buildProfilePatch", () => {
  const me = { display_name: "Andy", bio: "Coffee first." };

  it("sends only the fields that changed, trimmed", () => {
    const { patch, errors } = buildProfilePatch(me, { displayName: "  Andy Do ", bio: "Coffee first." });
    expect(errors).toEqual({});
    expect(patch).toEqual({ display_name: "Andy Do" });
    expect(PatchMeRequest.safeParse(patch).success).toBe(true);
  });

  it("returns no patch when nothing changed", () => {
    expect(buildProfilePatch(me, { displayName: "Andy", bio: " Coffee first. " }).patch).toBeNull();
    expect(buildProfilePatch({ display_name: null, bio: null }, { displayName: " ", bio: "" }).patch).toBeNull();
  });

  it("clears a field that was blanked", () => {
    expect(buildProfilePatch(me, { displayName: "", bio: "   " }).patch).toEqual({ display_name: null, bio: null });
  });

  it("rejects over-long values with per-field messages and no patch", () => {
    const { patch, errors } = buildProfilePatch(me, { displayName: "x".repeat(41), bio: "y".repeat(161) });
    expect(patch).toBeNull();
    expect(errors.displayName).toMatch(/40/);
    expect(errors.bio).toMatch(/160/);
  });

  it("accepts the limits exactly", () => {
    const { patch } = buildProfilePatch(me, { displayName: "x".repeat(40), bio: "y".repeat(160) });
    expect(PatchMeRequest.safeParse(patch).success).toBe(true);
  });
});

describe("usernameProblem", () => {
  it("follows the contract's Username rule", () => {
    expect(usernameProblem("andy_do4")).toBeNull();
    expect(usernameProblem("ab")).toMatch(/3–24/);
    expect(usernameProblem("Andy")).toMatch(/lowercase/);
    expect(usernameProblem("andy.do")).not.toBeNull();
  });
});

describe("buildChangeEmailRequest", () => {
  it("trims and lowercases the new email", () => {
    expect(buildChangeEmailRequest("  New@Example.COM ", "pw")).toEqual({ new_email: "new@example.com", password: "pw" });
  });

  it("returns null for a bad email or a missing password", () => {
    expect(buildChangeEmailRequest("not-an-email", "pw")).toBeNull();
    expect(buildChangeEmailRequest("new@example.com", "")).toBeNull();
  });
});

describe("profileErrorMessage", () => {
  const now = new Date("2026-09-26T12:00:00Z");

  it("says how many days are left on the username cooldown", () => {
    const e = new ApiError(409, { error: "username_cooldown", retry_at: "2026-10-08T09:00:00.000Z" });
    expect(profileErrorMessage(e, now)).toBe("You can change your username once every 30 days. Try again in 12 days.");
    const soon = new ApiError(409, { error: "username_cooldown", retry_at: "2026-09-26T13:00:00.000Z" });
    expect(profileErrorMessage(soon, now)).toMatch(/in 1 day\.$/);
  });

  it("still states the rule when retry_at is missing", () => {
    expect(profileErrorMessage(new ApiError(409, { error: "username_cooldown" }), now)).toBe(
      "You can change your username once every 30 days.",
    );
  });

  it("maps the server's error codes", () => {
    const msg = (status: number, error: string) => profileErrorMessage(new ApiError(status, { error }), now);
    expect(msg(409, "username_taken")).toMatch(/taken/);
    expect(msg(401, "invalid_credentials")).toMatch(/password/);
    expect(msg(400, "same_email")).toMatch(/already your email/);
    expect(msg(409, "email_taken")).toMatch(/already in use/);
    expect(msg(429, "cooldown")).toMatch(/Wait a minute/);
    expect(msg(400, "wrong_code")).toMatch(/isn't right/);
    expect(msg(400, "code_expired")).toMatch(/Send a new one/);
  });

  it("falls back for network and unknown errors", () => {
    expect(profileErrorMessage(new TypeError("Network request failed"), now)).toMatch(/reach the server/);
    expect(profileErrorMessage(new ApiError(500, {}), now)).toMatch(/went wrong/);
  });
});

describe("buildPrefsPatch", () => {
  const me = { pref_activities: "bouldering", pref_personality: null, budget: null };

  it("sends only changed, trimmed fields and clears blanks", () => {
    expect(buildPrefsPatch(me, { activities: " bouldering ", personality: "", budget: null })).toBeNull();
    const patch = buildPrefsPatch(me, { activities: "  ", personality: " early bird ", budget: null });
    expect(patch).toEqual({ pref_activities: null, pref_personality: "early bird" });
    expect(PatchMeRequest.parse(patch)).toEqual(patch);
  });

  it("sends the budget only when it changed, and null to clear it (#324)", () => {
    const budget = { nice_dinner: { spend: 60, often: "monthly" as const } };
    const draft = { activities: "bouldering", personality: "" };
    expect(buildPrefsPatch(me, { ...draft, budget })).toEqual({ budget });
    expect(buildPrefsPatch({ ...me, budget }, { ...draft, budget: { nice_dinner: { spend: 60, often: "monthly" } } })).toBeNull();
    expect(buildPrefsPatch({ ...me, budget }, { ...draft, budget: { nice_dinner: { spend: 60, often: "rarely" } } }))
      .toEqual({ budget: { nice_dinner: { spend: 60, often: "rarely" } } });
    expect(buildPrefsPatch({ ...me, budget }, { ...draft, budget: null })).toEqual({ budget: null });
  });
});

describe("buildBudget (#324)", () => {
  it("round-trips a saved budget through the form; untouched rows stay unset", () => {
    const budget = { nice_dinner: { spend: 60, often: "monthly" as const }, coffee_snacks: { spend: 0, often: "weekly" as const } };
    const draft = budgetDraft(budget);
    expect(draft.casual_meal).toEqual({ spend: "", often: null });
    expect(buildBudget(draft)).toEqual({ budget, errors: {} });
    expect(PatchMeRequest.parse({ budget })).toEqual({ budget });
  });

  it("is null when every row is empty", () => {
    expect(buildBudget(budgetDraft(null))).toEqual({ budget: null, errors: {} });
  });

  it("needs whole dollars 0–500 and a frequency on any row that's started", () => {
    const draft = budgetDraft(null);
    draft.nice_dinner = { spend: " 60 ", often: null };
    draft.casual_meal = { spend: "12.50", often: "weekly" };
    draft.drinks_night_out = { spend: "501", often: "monthly" };
    draft.tickets_activities = { spend: "", often: "rarely" };
    draft.coffee_snacks = { spend: "8", often: "few_times_a_month" };
    const { budget, errors } = buildBudget(draft);
    expect(budget).toEqual({ coffee_snacks: { spend: 8, often: "few_times_a_month" } });
    expect(errors).toEqual({
      nice_dinner: "Pick how often.",
      casual_meal: "Enter whole dollars, 0 to 500.",
      drinks_night_out: "Enter whole dollars, 0 to 500.",
      tickets_activities: "Enter whole dollars, 0 to 500.",
    });
  });
});
