import { interest } from "./interest.ts";

export type Candidate = {
  id: number;
  title: string;
  lang: string;
  lat: number;
  lon: number;
  family: string;
  views: number;
  langs: number;
  bytes: number;
  image: string | null;
  trend: number | null;
};

const STUB_BYTES = 2500;

function percentile<T>(items: T[], value: (item: T) => number) {
  const sorted = items.map(value).sort((a, b) => a - b);
  return (item: T) => {
    const target = value(item);
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (sorted[mid] < target) low = mid + 1;
      else high = mid;
    }
    return low / sorted.length;
  };
}

// Below this many monthly readers, an article is usually too obscure to be worth a visit.
const ALIVE_VIEWS = 30;

/** Best first. offbeat 0 favours famous places, 1 favours little-known ones that are still alive. */
export function rank(places: Candidate[], offbeat: number, trending = 0): Candidate[] {
  const counts = new Map<string, number>();
  for (const { family } of places) counts.set(family, (counts.get(family) ?? 0) + 1);
  const views = percentile(places, (p) => p.views);
  const langs = percentile(places, (p) => p.langs);
  const commonness = percentile(places, (p) => counts.get(p.family) ?? 0);
  const momentum = percentile(places, (p) => p.trend ?? 1);
  // Niche is a sweet spot, not the bottom of the list: the emptiest pages are rarely gems.
  const target = 1 - 0.7 * offbeat;

  const score = (place: Candidate) => {
    const fame = (views(place) + langs(place)) / 2;
    const fit = 1 - Math.abs(fame - target) * 1.6;
    const alive = Math.min(1, place.views / ALIVE_VIEWS);
    // Size is only known once the refresh job has reached an article.
    const stub = place.bytes > 0 && place.bytes < STUB_BYTES ? 0.3 : 0;
    return (
      1.2 * interest(place.family) +
      1.2 * fit +
      0.6 * alive +
      (place.image ? 0.5 : 0) +
      0.4 * offbeat * (1 - commonness(place)) +
      trending * momentum(place) -
      stub
    );
  };
  return places
    .map((place) => ({ place, score: score(place) }))
    .sort((a, b) => b.score - a.score)
    .map(({ place }) => place);
}
