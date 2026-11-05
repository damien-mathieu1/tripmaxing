import { km } from "./plan.ts";

export type Coordinate = [number, number];

const point = ([lon, lat]: Coordinate) => ({ lat, lon });

export function lengthKm(path: Coordinate[]) {
  return path.slice(1).reduce((total, c, i) => total + km(point(path[i]), point(c)), 0);
}

/** The start of a path, cut at a fraction of its length. */
export function sliceAlong(path: Coordinate[], fraction: number): Coordinate[] {
  if (path.length < 2 || fraction >= 1) return path;
  if (fraction <= 0) return path.slice(0, 1);
  let left = lengthKm(path) * fraction;
  for (let i = 1; i < path.length; i++) {
    const segment = km(point(path[i - 1]), point(path[i]));
    if (segment >= left) {
      const ratio = segment === 0 ? 0 : left / segment;
      const [lon0, lat0] = path[i - 1];
      const [lon1, lat1] = path[i];
      return [...path.slice(0, i), [lon0 + (lon1 - lon0) * ratio, lat0 + (lat1 - lat0) * ratio]];
    }
    left -= segment;
  }
  return path;
}

export const pointAlong = (path: Coordinate[], fraction: number) =>
  sliceAlong(path, fraction).at(-1)!;
