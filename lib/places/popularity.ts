// Slider positions are logarithmic: 10 steps per power of ten, so niche ranges stay usable.
export const SLIDER_MAX = 60;
const STEPS_PER_DECADE = 10;

export type Range = [number, number];

export const FULL_RANGE: Range = [0, SLIDER_MAX];

export const PRESETS = {
  niche: [0, 20],
  moderate: [20, 30],
  touristy: [30, SLIDER_MAX],
} as const satisfies Record<string, Range>;

export function viewsAt(position: number) {
  if (position <= 0) return 0;
  return Number((10 ** (position / STEPS_PER_DECADE)).toPrecision(2));
}

export function viewsFilter([from, to]: Range) {
  return {
    minViews: from > 0 ? viewsAt(from) : undefined,
    maxViews: to < SLIDER_MAX ? viewsAt(to) : undefined,
  };
}
