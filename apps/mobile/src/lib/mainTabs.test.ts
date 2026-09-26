import { describe, expect, it } from "vitest";
import { HIDDEN_MAIN_ROUTES, MAIN_TABS } from "./mainTabs";

describe("MAIN_TABS", () => {
  it("shows Hangouts / Friends / Squads / You, with the feed first", () => {
    expect(MAIN_TABS.map((t) => t.title)).toEqual(["Hangouts", "Friends", "Squads", "You"]);
    expect(MAIN_TABS[0]?.name).toBe("index");
  });

  it("keeps the route names other lanes link to (src/app/(main)/<name>.tsx)", () => {
    expect(MAIN_TABS.map((t) => t.name)).toEqual(["index", "friends", "squads", "you"]);
  });

  it("gives every tab an icon on each platform", () => {
    for (const tab of MAIN_TABS) {
      expect(tab.icon.ios).toBeTruthy();
      expect(tab.icon.android).toBeTruthy();
      expect(tab.icon.web).toBeTruthy();
    }
  });

  it("keeps the dev card-states route out of the tab bar", () => {
    const names: readonly string[] = MAIN_TABS.map((t) => t.name);
    expect(HIDDEN_MAIN_ROUTES).toContain("card-states");
    for (const hidden of HIDDEN_MAIN_ROUTES) expect(names).not.toContain(hidden);
  });
});
