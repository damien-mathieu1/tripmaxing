import { expect, it } from "vitest";
import { type Coordinate, lengthKm, pointAlong, sliceAlong } from "./path";

const path: Coordinate[] = [
  [0, 0],
  [1, 0],
  [2, 0],
];

it("measures a path", () => {
  expect(lengthKm(path)).toBeCloseTo(222.4, 0);
});

it("finds points along the path", () => {
  expect(pointAlong(path, 0)).toEqual([0, 0]);
  expect(pointAlong(path, 1)).toEqual([2, 0]);
  expect(pointAlong(path, 0.75)[0]).toBeCloseTo(1.5);
});

it("keeps every corner it has passed", () => {
  expect(sliceAlong(path, 0.75)).toHaveLength(3);
  expect(sliceAlong(path, 0.25)).toHaveLength(2);
});

it("copes with a single point", () => {
  expect(pointAlong([[3, 4]], 0.5)).toEqual([3, 4]);
});
