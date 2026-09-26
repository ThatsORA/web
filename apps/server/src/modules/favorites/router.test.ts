import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteMany: vi.fn(), createMany: vi.fn(), transaction: vi.fn() }));
vi.mock("../../lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { signToken } from "../../lib/auth";
import { favoritesRouter } from "./router";

const userId = "6f48fb35-1518-481d-ab60-cfd2dcc28acf";
let base: string;
let close: () => void;
beforeAll(async () => {
  const app = express();
  app.use(express.json(), favoritesRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/favorites`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteMany.mockResolvedValue({ count: 2 });
  mocks.createMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({ userFavorite: { deleteMany: mocks.deleteMany, createMany: mocks.createMany } }),
  );
});
const put = (payload: unknown, auth = true) =>
  fetch(base, {
    method: "PUT",
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${signToken(userId)}` } : {}) },
    body: JSON.stringify(payload),
  });

describe("PUT /favorites", () => {
  it("requires authentication", async () => {
    expect((await put({ categories: ["coffee_shop"] }, false)).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects bodies that don't match PutFavoritesRequest before touching the DB", async () => {
    for (const invalid of [{}, { categories: "coffee_shop" }, { categories: [1] }, { categories: Array(21).fill("bar") }]) {
      expect((await put(invalid)).status).toBe(400);
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("replaces only the caller's rows in one transaction", async () => {
    const response = await put({ categories: ["coffee_shop", "taco_restaurant"] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ categories: ["coffee_shop", "taco_restaurant"] });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId } });
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [
        { userId, category: "coffee_shop" },
        { userId, category: "taco_restaurant" },
      ],
    });
    expect(mocks.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.createMany.mock.invocationCallOrder[0]!);
  });

  it("dedupes categories, keeping tap order", async () => {
    const response = await put({ categories: ["bar", "coffee_shop", "bar"] });
    expect(await response.json()).toEqual({ categories: ["bar", "coffee_shop"] });
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [
        { userId, category: "bar" },
        { userId, category: "coffee_shop" },
      ],
    });
  });

  it("clears the caller's favorites on an empty list", async () => {
    const response = await put({ categories: [] });
    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId } });
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});
