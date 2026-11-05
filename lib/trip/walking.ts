import type { Coordinate } from "./path";
import { lengthKm } from "./path";
import type { Candidate } from "./score";

const ROUTER = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";
const FALLBACK_KMH = 4.5;

export type TripDay = {
  stops: Candidate[];
  legs: Coordinate[][];
  legMinutes: number[];
  km: number;
  walkMinutes: number;
  estimated: boolean;
};

type Step = { geometry: { coordinates: Coordinate[] } };
type Answer = { routes?: { legs: { duration: number; distance: number; steps: Step[] }[] }[] };

function straightDay(stops: Candidate[]): TripDay {
  const legs = stops.slice(1).map((stop, i): Coordinate[] => [
    [stops[i].lon, stops[i].lat],
    [stop.lon, stop.lat],
  ]);
  const km = legs.reduce((total, leg) => total + lengthKm(leg), 0);
  const legMinutes = legs.map((leg) => Math.round((lengthKm(leg) / FALLBACK_KMH) * 60));
  return {
    stops,
    legs,
    legMinutes,
    km,
    walkMinutes: legMinutes.reduce((a, b) => a + b, 0),
    estimated: true,
  };
}

/** Real footpaths from a free public router. The trip still works, in straight lines, without it. */
export async function walkDay(stops: Candidate[]): Promise<TripDay> {
  const coordinates = stops.map((stop) => `${stop.lon},${stop.lat}`).join(";");
  try {
    const response = await fetch(
      `${ROUTER}/${coordinates}?overview=false&steps=true&geometries=geojson`,
      { signal: AbortSignal.timeout(8000) },
    );
    const route = ((await response.json()) as Answer).routes?.[0];
    if (!route) return straightDay(stops);
    const legs = route.legs.map((leg) => leg.steps.flatMap((step) => step.geometry.coordinates));
    const legMinutes = route.legs.map((leg) => Math.max(1, Math.round(leg.duration / 60)));
    return {
      stops,
      legs,
      legMinutes,
      km: route.legs.reduce((total, leg) => total + leg.distance, 0) / 1000,
      walkMinutes: legMinutes.reduce((a, b) => a + b, 0),
      estimated: false,
    };
  } catch {
    return straightDay(stops);
  }
}
