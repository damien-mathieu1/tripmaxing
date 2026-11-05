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

const FULL_ARTICLE_BYTES = 5000;

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

/** Best first. offbeat 0 favours famous places, 1 favours rare ones. */
export function rank(places: Candidate[], offbeat: number, trending = 0): Candidate[] {
  const counts = new Map<string, number>();
  for (const { family } of places) counts.set(family, (counts.get(family) ?? 0) + 1);
  const views = percentile(places, (p) => p.views);
  const langs = percentile(places, (p) => p.langs);
  const commonness = percentile(places, (p) => counts.get(p.family) ?? 0);
  const momentum = percentile(places, (p) => p.trend ?? 1);

  const score = (place: Candidate) => {
    const fame = (views(place) + langs(place)) / 2;
    // A short article can describe a great place: only stubs lose points.
    const quality = Math.min(1, place.bytes / FULL_ARTICLE_BYTES) * (place.image ? 1 : 0.6);
    return (
      quality +
      offbeat * (2 - fame - commonness(place)) +
      (1 - offbeat) * fame +
      trending * momentum(place)
    );
  };
  return places
    .map((place) => ({ place, score: score(place) }))
    .sort((a, b) => b.score - a.score)
    .map(({ place }) => place);
}
