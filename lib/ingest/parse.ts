import { familyOf } from "../places/family.ts";
import { kindId, kindOf } from "../places/kind.ts";

export type PlaceRow = {
  id: number;
  lang: string;
  title: string;
  lon: number;
  lat: number;
  langs: number;
  image: string | null;
  kind: number;
  family: string | null;
};

const MAX_LANGS = 32767;
const FILE_PATH = "Special:FilePath/";

const unquote = (value: string) =>
  /^"(.*)"(?:@[\w-]+)?$/.exec(value)?.[1].replace(/\\(["\\])/g, "$1") ?? value;

/** One TSV line of the places query: item, title, coordinates, sitelinks, image, types. */
export function parsePlace(line: string, lang: string, labels: Map<string, string>) {
  const [item, title, coord, links, image, types] = line.split("\t");
  const id = /Q(\d+)>$/.exec(item)?.[1];
  // Coordinates on the Moon or Mars carry a prefix and never match.
  const point = /^"?POINT\((\S+) (\S+)\)/i.exec(coord ?? "");
  if (!id || !title || !point) return null;
  const lon = Number(point[1]);
  const lat = Number(point[2]);
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;

  const named: Record<string, string> = {};
  for (const [qid] of (types ?? "").matchAll(/Q\d+/g)) {
    const label = labels.get(qid);
    if (label) named[qid] = label;
  }
  const file = image?.indexOf(FILE_PATH) ?? -1;
  return {
    id: Number(id),
    lang,
    title: unquote(title),
    lon,
    lat,
    langs: Math.min(Number(links) || 0, MAX_LANGS),
    image: file >= 0 ? decodeURIComponent(image.slice(file + FILE_PATH.length, -1)) : null,
    kind: kindId(kindOf(named)),
    family: familyOf(named),
  } satisfies PlaceRow;
}

/** One line of a pageviews dump: project, title, page id, access method, total, hourly detail. */
export function parseViews(line: string) {
  const [project, title, , , total] = line.split(" ");
  return { project, title: title?.replaceAll("_", " "), views: Number(total) || 0 };
}

// Keeps tiny articles from swinging from 1 to 5 views and looking like a trend.
const TREND_SMOOTHING = 10;

export const trendOf = (recent: number, previous: number) =>
  (recent + TREND_SMOOTHING) / (previous + TREND_SMOOTHING);
