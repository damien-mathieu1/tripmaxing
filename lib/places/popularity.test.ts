import { expect, it } from "vitest";
import { FULL_RANGE, PRESETS, viewsAt, viewsFilter } from "./popularity";

it("maps positions to round view counts", () => {
  expect(viewsAt(0)).toBe(0);
  expect(viewsAt(20)).toBe(100);
  expect(viewsAt(30)).toBe(1000);
  expect(viewsAt(25)).toBe(320);
});

it("sends no limit at the ends of the slider", () => {
  expect(viewsFilter(FULL_RANGE)).toEqual({ minViews: undefined, maxViews: undefined });
  expect(viewsFilter(PRESETS.niche)).toEqual({ minViews: undefined, maxViews: 100 });
  expect(viewsFilter(PRESETS.touristy)).toEqual({ minViews: 1000, maxViews: undefined });
});
