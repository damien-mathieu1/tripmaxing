import type { Coordinate } from "./path";
import type { TripDay } from "./walking";

const KEY = "wikitrip.trips";
const CACHE_PREFIX = "wikitrip-trip-";
const TILE_ZOOMS = [10, 11, 12, 13, 14];
const DOWNLOADS_AT_ONCE = 6;

export type SavedTrip = { id: string; name: string; createdAt: string; days: TripDay[] };

export function loadTrips(): SavedTrip[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeTrips(trips: SavedTrip[]) {
  localStorage.setItem(KEY, JSON.stringify(trips));
}

export function tileOf([lon, lat]: Coordinate, zoom: number) {
  const scale = 2 ** zoom;
  const radians = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lon + 180) / 360) * scale),
    y: Math.floor(((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * scale),
  };
}

/** Every base map tile a day needs, from the template of a raster source. */
export function tileUrls(days: TripDay[], template: string) {
  const urls = new Set<string>();
  for (const coordinate of days.flatMap((day) => day.legs.flat())) {
    for (const zoom of TILE_ZOOMS) {
      const { x, y } = tileOf(coordinate, zoom);
      urls.add(
        template.replace("{z}", String(zoom)).replace("{x}", String(x)).replace("{y}", String(y)),
      );
    }
  }
  return [...urls];
}

async function download(cache: Cache, urls: string[], mode: RequestMode) {
  for (let start = 0; start < urls.length; start += DOWNLOADS_AT_ONCE) {
    await Promise.allSettled(
      urls.slice(start, start + DOWNLOADS_AT_ONCE).map(async (url) => {
        await cache.put(url, await fetch(url, { mode }));
      }),
    );
  }
}

export async function saveTrip(
  trip: Omit<SavedTrip, "id" | "createdAt">,
  assets: { tiles: string[]; photos: string[]; texts: string[] },
) {
  const saved: SavedTrip = {
    ...trip,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  writeTrips([saved, ...loadTrips()]);
  if ("caches" in window) {
    const cache = await caches.open(CACHE_PREFIX + saved.id);
    await download(cache, assets.tiles, "cors");
    await download(cache, assets.texts, "cors");
    await download(cache, assets.photos, "no-cors");
  }
  return saved;
}

export async function deleteTrip(id: string) {
  writeTrips(loadTrips().filter((trip) => trip.id !== id));
  if ("caches" in window) await caches.delete(CACHE_PREFIX + id);
}
