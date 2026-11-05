import { expect, it } from "vitest";
import { toHits, tripRadiusKm, zoomFor } from "./search";

it.each([
  ["commune française du département de l'Hérault", 12],
  ["village d'Espagne", 14],
  ["pays d'Europe de l'Ouest", 4.5],
  ["région de France", 6.5],
  ["statue à Paris", 15],
])("%s zooms to %d", (description, zoom) => {
  expect(zoomFor(description)).toBe(zoom);
});

it("keeps items with a label only", () => {
  expect(
    toHits([{ id: "Q6441", label: "Montpellier" }, { id: "Q2" }, { id: "L1", label: "x" }]),
  ).toEqual([{ id: 6441, label: "Montpellier", description: "" }]);
});

it("widens the trip area with the size of the place", () => {
  expect(tripRadiusKm(4.5, 2)).toBeGreaterThan(tripRadiusKm(6.5, 2));
  expect(tripRadiusKm(6.5, 2)).toBeGreaterThan(tripRadiusKm(12, 2));
});
