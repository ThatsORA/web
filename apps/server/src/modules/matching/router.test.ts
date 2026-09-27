import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ triggerMatcher: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { user: { findUnique: async () => ({ passwordChangedAt: null }) } } }));
vi.mock("./matcher", () => ({ triggerMatcher: mocks.triggerMatcher }));

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
});

describe("POST /scheduler/run", () => {
  it("requires authentication", async () => {
    expect((await fetch(base, { method: "POST" })).status).toBe(401);
    expect(mocks.triggerMatcher).not.toHaveBeenCalled();
  });

  it("replies 202 and runs the scheduler with force", async () => {
    const auth = { authorization: `Bearer ${signToken("6f48fb35-1518-481d-ab60-cfd2dcc28acf")}` };
    expect((await fetch(base, { method: "POST", headers: auth })).status).toBe(202);
    expect(mocks.triggerMatcher).toHaveBeenCalledWith({ force: true });
  });
});
