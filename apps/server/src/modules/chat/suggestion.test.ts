import { describe, expect, it } from "vitest";
import { chatSuggestion } from "./suggestion";

const intents = ["cant_make_it", "running_late", "change_spot", "logistics", "just_chatting"];
/** `top` gets `p`; the rest split what's left. */
const probs = (top: string, p: number) =>
  Object.fromEntries(intents.map((k) => [k, k === top ? p : (1 - p) / (intents.length - 1)]));
const allowed = { canPass: true, canChangeSpot: true };

describe("chatSuggestion", () => {
  it("maps each actionable intent to its suggestion", () => {
    expect(chatSuggestion(probs("cant_make_it", 0.9), allowed)).toEqual({ kind: "pass" });
    expect(chatSuggestion(probs("change_spot", 0.9), allowed)).toEqual({ kind: "change_spot" });
    expect(chatSuggestion(probs("running_late", 0.9), allowed)).toEqual({ kind: "running_late_hint" });
  });

  it("acts at 0.75 and not below", () => {
    expect(chatSuggestion(probs("cant_make_it", 0.75), allowed)).toEqual({ kind: "pass" });
    expect(chatSuggestion(probs("cant_make_it", 0.74), allowed)).toBeNull();
  });

  it("never acts on just_chatting or logistics, however sure", () => {
    expect(chatSuggestion(probs("just_chatting", 0.99), allowed)).toBeNull();
    expect(chatSuggestion(probs("logistics", 0.99), allowed)).toBeNull();
  });

  it("offers Pass only when the sender can still pass", () => {
    expect(chatSuggestion(probs("cant_make_it", 0.9), { ...allowed, canPass: false })).toBeNull();
  });

  it("offers Change spot only when #214 allows it", () => {
    expect(chatSuggestion(probs("change_spot", 0.9), { ...allowed, canChangeSpot: false })).toBeNull();
  });

  it("still hints running late when neither action is allowed", () => {
    expect(chatSuggestion(probs("running_late", 0.8), { canPass: false, canChangeSpot: false })).toEqual({
      kind: "running_late_hint",
    });
  });
});
