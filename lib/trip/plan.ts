import { type Candidate, rank } from "./score";

type Point = { lat: number; lon: number };

export type TripOptions = {
  days: number;
  stops: number;
  offbeat: number;
  trending?: number;
  dayRadiusKm?: number;
};

// shortcut: straight line x detour, use a routing API when real walking times matter
const DETOUR = 1.3;
const WALK_KMH = 4.5;
const VISIT_MINUTES = 30;
const MAX_PER_FAMILY = 2;
const POOL_PER_STOP = 8;

export function km(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function routeKm(route: Point[]) {
  return route.slice(1).reduce((total, point, i) => total + km(route[i], point), 0);
}

/** Nearest neighbour, then 2-opt on an open path. */
export function order<T extends Point>(stops: T[]): T[] {
  const left = stops.slice(1);
  let route = stops.slice(0, 1);
  while (left.length) {
    const last = route[route.length - 1];
    const next = left.reduce((best, p) => (km(last, p) < km(last, best) ? p : best));
    left.splice(left.indexOf(next), 1);
    route.push(next);
  }
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [
          ...route.slice(0, i),
          ...route.slice(i, j + 1).reverse(),
          ...route.slice(j + 1),
        ];
        if (routeKm(candidate) < routeKm(route) - 1e-9) {
          route = candidate;
          improved = true;
        }
      }
    }
  }
  return route;
}

function pickDay(seed: Candidate, pool: Candidate[], stops: number, radiusKm: number) {
  const seen = new Map([[seed.family, 1]]);
  const day = [seed];
  for (const place of pool) {
    if (day.length === stops) break;
    const count = seen.get(place.family) ?? 0;
    if (place !== seed && count < MAX_PER_FAMILY && km(seed, place) <= radiusKm) {
      seen.set(place.family, count + 1);
      day.push(place);
    }
  }
  return day;
}

export function planTrip(places: Candidate[], options: TripOptions) {
  const { days, stops, offbeat, trending = 0, dayRadiusKm = 1.5 } = options;
  let pool = rank(places, offbeat, trending).slice(0, days * stops * POOL_PER_STOP);
  const seeds: Candidate[] = [];
  const trip: Candidate[][] = [];

  for (let n = 0; n < days; n++) {
    const fill = (seed: Candidate) => pickDay(seed, pool, stops, dayRadiusKm);
    const apart = (seed: Candidate) => seeds.every((other) => km(seed, other) > dayRadiusKm);
    // Prefer a new area each day, reuse a nearby one rather than dropping a day.
    const seed =
      pool.find((p) => apart(p) && fill(p).length === stops) ??
      pool.find((p) => fill(p).length === stops);
    if (!seed) break;
    const day = fill(seed);
    seeds.push(seed);
    trip.push(order(day));
    pool = pool.filter((place) => !day.includes(place));
  }

  return trip.map((route) => {
    const walkKm = routeKm(route) * DETOUR;
    return {
      walkKm: Math.round(walkKm * 10) / 10,
      minutes: Math.round((walkKm / WALK_KMH) * 60 + route.length * VISIT_MINUTES),
      stops: route,
    };
  });
}
