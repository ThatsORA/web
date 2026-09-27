import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ triggerMatcher: vi.fn() }));
const OPERATOR_ID = vi.hoisted(() => "6f48fb35-1518-481d-ab60-cfd2dcc28acf");
vi.mock("../../lib/prisma", () => ({
  prisma: { user: { findUnique: async ({ where }: { where: { id: string } }) => ({ passwordChangedAt: null, username: where.id === OPERATOR_ID ? "ojas" : "riley" }) } },
}));
vi.mock("./matcher", () => ({ triggerMatcher: mocks.triggerMatcher }));

import { env } from "../../env";
import { signToken } from "../../lib/auth";
import { matchingRouter } from "./router";

let base: string;
let close: () => void;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), matchingRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/scheduler/run`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.triggerMatcher.mockResolvedValue(undefined);
  env.OPERATOR_USERNAMES = ["andy", "ojas"];
});

describe("POST /scheduler/run", () => {
  it("requires authentication", async () => {
    expect((await fetch(base, { method: "POST" })).status).toBe(401);
    expect(mocks.triggerMatcher).not.toHaveBeenCalled();
  });

  it("forbids non-operators and doesn't run the scheduler", async () => {
    const auth = { authorization: `Bearer ${signToken("0b1c2d3e-1518-481d-ab60-cfd2dcc28acf")}` };
    const res = await fetch(base, { method: "POST", headers: auth });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(mocks.triggerMatcher).not.toHaveBeenCalled();
  });

  it("replies 202 and runs the scheduler with force for an operator", async () => {
    const auth = { authorization: `Bearer ${signToken(OPERATOR_ID)}` };
    expect((await fetch(base, { method: "POST", headers: auth })).status).toBe(202);
    expect(mocks.triggerMatcher).toHaveBeenCalledWith({ force: true });
  });
});
