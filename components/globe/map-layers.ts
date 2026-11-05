import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { Kind } from "@/lib/places/kind";
import { type Range, viewsFilter } from "@/lib/places/popularity";
import { RISING_MIN_VIEWS, RISING_TREND } from "./pin";

export const BORDERS = {
  countries: { level: 2, width: 1.4, opacity: 0.9, minzoom: 0 },
  regions: { level: 4, width: 1, opacity: 0.75, minzoom: 3 },
  // OpenFreeMap only ships level 6 from about zoom 9.
  departments: { level: 6, width: 0.7, opacity: 0.65, minzoom: 9 },
} as const;

export type BorderId = keyof typeof BORDERS;
export type Filters = { rising: boolean; kinds: Kind[]; views: Range };

const PIN_WIDTH = 40;
const PIN_HEIGHT = 52;
const IS_RISING: ExpressionSpecification = [
  "all",
  [">=", ["coalesce", ["get", "trend"], 0], RISING_TREND],
  [">=", ["get", "views"], RISING_MIN_VIEWS],
];

function drawPin(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = PIN_WIDTH;
  canvas.height = PIN_HEIGHT;
  const context = canvas.getContext("2d")!;
  const centerX = PIN_WIDTH / 2;
  const centerY = 19;
  const radius = 15;
  context.shadowColor = "rgb(0 0 0 / 40%)";
  context.shadowBlur = 4;
  context.shadowOffsetY = 1;
  context.beginPath();
  context.arc(centerX, centerY, radius, Math.PI * 0.85, Math.PI * 0.15);
  context.quadraticCurveTo(centerX + 6, 38, centerX, PIN_HEIGHT - 4);
  context.quadraticCurveTo(centerX - 6, 38, centerX - radius * 0.89, centerY + radius * 0.45);
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 2.5;
  context.strokeStyle = "#ffffff";
  context.stroke();
  context.beginPath();
  context.arc(centerX, centerY, 5.5, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  return context.getImageData(0, 0, PIN_WIDTH, PIN_HEIGHT);
}

export function tilesUrl({ rising, kinds, views }: Filters) {
  const query = new URLSearchParams();
  if (rising) query.set("rising", "1");
  if (kinds.length) query.set("kinds", kinds.join(","));
  const { minViews, maxViews } = viewsFilter(views);
  if (minViews !== undefined) query.set("minViews", String(minViews));
  if (maxViews !== undefined) query.set("maxViews", String(maxViews));
  const suffix = query.size ? `?${query}` : "";
  return `${window.location.origin}/api/tiles/{z}/{x}/{y}${suffix}`;
}

export function addBorders(map: MapLibreMap, visible: BorderId[], color: string) {
  map.addSource("admin", { type: "vector", url: "https://tiles.openfreemap.org/planet" });
  for (const [id, border] of Object.entries(BORDERS)) {
    map.addLayer({
      id: `border-${id}`,
      type: "line",
      source: "admin",
      "source-layer": "boundary",
      minzoom: border.minzoom,
      filter: ["all", ["==", ["get", "admin_level"], border.level], ["!=", ["get", "maritime"], 1]],
      layout: {
        "line-join": "round",
        visibility: visible.includes(id as BorderId) ? "visible" : "none",
      },
      paint: {
        "line-color": color,
        "line-width": border.width,
        "line-opacity": border.opacity,
      },
    });
  }
}

export function addPins(map: MapLibreMap, filters: Filters) {
  map.addImage("pin", drawPin("#e11d48"), { pixelRatio: 2 });
  map.addImage("pin-rising", drawPin("#f97316"), { pixelRatio: 2 });
  map.addSource("places", {
    type: "vector",
    tiles: [tilesUrl(filters)],
    maxzoom: 14,
    attribution:
      '<a href="https://www.wikipedia.org">Wikipédia</a> (CC BY-SA), <a href="https://www.wikidata.org">Wikidata</a>',
  });
  map.addLayer({
    id: "pins",
    type: "symbol",
    source: "places",
    "source-layer": "places",
    layout: {
      "icon-image": ["case", IS_RISING, "pin-rising", "pin"],
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.55, 8, 0.8, 14, 1],
      "symbol-sort-key": ["-", 0, ["get", "views"]],
    },
  });
}
