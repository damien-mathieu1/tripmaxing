import type { StyleSpecification } from "maplibre-gl";

const raster = (tiles: string[], attribution: string, maxzoom: number): StyleSpecification => ({
  version: 8,
  projection: { type: "globe" },
  sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
  sources: { base: { type: "raster", tiles, tileSize: 256, attribution, maxzoom } },
  layers: [
    // Keeps the planet solid while its first tiles load.
    { id: "ocean", type: "background", paint: { "background-color": "#0b1a33" } },
    { id: "base", type: "raster", source: "base" },
  ],
});

export const MAP_STYLES = {
  satellite: {
    borderColor: "#ffffff",
    style: raster(
      ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"],
      '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by EOX (Copernicus Sentinel data 2020)',
      14,
    ),
  },
  roads: {
    borderColor: "#6d28d9",
    style: "https://tiles.openfreemap.org/styles/liberty",
  },
  topo: {
    borderColor: "#6d28d9",
    style: raster(
      ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
      'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
      17,
    ),
  },
} as const;

export type MapStyleId = keyof typeof MAP_STYLES;
