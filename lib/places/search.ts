export type SearchHit = { id: number; label: string; description: string };

// First match wins: "commune du département X" is a town, not a department.
const ZOOMS: [RegExp, number][] = [
  [/commune|ville|cité|city|town|municipal/i, 12],
  [/village|hameau|hamlet|localité|quartier|neighbou?rhood/i, 14],
  [/\b(pays|country|état souverain|sovereign)\b/i, 4.5],
  [/région|region|province|département|county|état|state/i, 6.5],
];
const DEFAULT_ZOOM = 15;

export function zoomFor(description: string) {
  return ZOOMS.find(([rule]) => rule.test(description))?.[1] ?? DEFAULT_ZOOM;
}

/** How far a trip looks around a place: a whole country, a region, or a town. */
export function tripRadiusKm(zoom: number, days: number) {
  if (zoom <= 5) return 400;
  if (zoom <= 8) return 80;
  return 6 + days * 2;
}

// Slider stops: fine steps for a town, big ones for a country.
export const PERIMETERS_KM = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 80, 100, 150, 200, 300, 400];

export const nearestPerimeter = (km: number) =>
  PERIMETERS_KM.reduce(
    (best, value, index) =>
      Math.abs(value - km) < Math.abs(PERIMETERS_KM[best] - km) ? index : best,
    0,
  );

type WikidataHit = { id: string; label?: string; description?: string };

export function toHits(results: WikidataHit[]): SearchHit[] {
  return results.flatMap(({ id, label, description }) =>
    label && /^Q\d+$/.test(id)
      ? [{ id: Number(id.slice(1)), label, description: description ?? "" }]
      : [],
  );
}
