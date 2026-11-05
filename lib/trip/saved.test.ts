import { beforeEach, expect, it, vi } from "vitest";
import { deleteTrip, loadTrips, saveTrip, tileOf, tileUrls } from "./saved";
import type { TripDay } from "./walking";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
});

const day = {
  stops: [],
  legs: [
    [
      [4.83, 45.76],
      [4.84, 45.77],
    ],
  ],
} as unknown as TripDay;

it("finds the tile of a place", () => {
  expect(tileOf([0, 0], 1)).toEqual({ x: 1, y: 1 });
  expect(tileOf([2.35, 48.85], 12)).toEqual({ x: 2074, y: 1409 });
});

it("lists unique tiles across zooms", () => {
  const urls = tileUrls([day], "t/{z}/{y}/{x}");
  expect(new Set(urls).size).toBe(urls.length);
  expect(urls.some((url) => url.startsWith("t/14/"))).toBe(true);
});

it("saves and deletes trips, newest first", async () => {
  const assets = { tiles: [], photos: [], texts: [] };
  await saveTrip({ name: "A", days: [] }, assets);
  const second = await saveTrip({ name: "B", days: [] }, assets);
  expect(loadTrips().map((trip) => trip.name)).toEqual(["B", "A"]);
  await deleteTrip(second.id);
  expect(loadTrips().map((trip) => trip.name)).toEqual(["A"]);
});

it("survives broken storage", () => {
  store.set("wikitrip.trips", "{nope");
  expect(loadTrips()).toEqual([]);
});
