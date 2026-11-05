"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { BookmarkIcon, RouteIcon, TrendingUpIcon } from "lucide-react";
import * as maplibregl from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SavedTrips } from "@/components/trip/saved-trips";
import { type PlannerPlace, TripPlanner } from "@/components/trip/trip-planner";
import { TripPlayer } from "@/components/trip/trip-player";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MAP_STYLES, type MapStyleId, SATELLITE_TILES } from "@/lib/map-styles";
import { KIND_IDS, type Kind } from "@/lib/places/kind";
import { FULL_RANGE } from "@/lib/places/popularity";
import { km } from "@/lib/trip/plan";
import { capitalize } from "@/lib/utils";
import { type SavedTrip, deleteTrip, loadTrips, saveTrip, tileUrls } from "@/lib/trip/saved";
import type { TripDay } from "@/lib/trip/walking";
import { FiltersPanel } from "./filters-panel";
import {
  BORDERS,
  type BorderId,
  type Filters,
  MIN_PIN_ZOOM,
  addBorders,
  addPins,
  hidePins,
  tilesUrl,
} from "./map-layers";
import { HOVER_PHOTO_WIDTH, MODAL_PHOTO_WIDTH, morph, namePhoto } from "./morph";
import { type Pin, photoUrl, revealPhoto, summaryUrl } from "./pin";
import { PlaceModal } from "./place-modal";
import { PopularityFilter } from "./popularity-filter";
import { type Destination, SearchBar } from "./search-bar";
import { starTile } from "./starfield";

// Photos near the edge of the planet would float in space.
const VISIBLE_HORIZON_KM = 4500;
const HORIZON_ZOOM = 6;
// Highlighted places by zoom: a few from space, more as streets appear.
const PHOTO_LIMITS: [zoom: number, count: number][] = [
  [MIN_PIN_ZOOM, 0],
  [4, 6],
  [8, 10],
  [12, 16],
  [Infinity, 40],
];
const TOUCH_HIT_PX = 18;
const MOUSE_HIT_PX = 3;
const STAR_PARALLAX = 2.5;
const SAME_PLACE_KM = 15;
const PHOTO_WAIT_MS = 250;
const PHOTO_SPACING_PX = 100;
// Half the photo: its centre sits on the place, the name hangs below.
const PHOTO_RADIUS_PX = 25;

/** Lets the big photo arrive before the morph snapshot, without ever holding up a tap. */
async function photoReady(image: HTMLImageElement | null) {
  if (!image) return;
  const big = new Image();
  big.src = image.src.replace(/width=\d+/, `width=${MODAL_PHOTO_WIDTH}`);
  const wait = new Promise((resolve) => setTimeout(resolve, PHOTO_WAIT_MS));
  await Promise.race([big.decode().catch(() => {}), wait]);
}

function photoMarker(pin: Pin, onSelect: (pin: Pin, image: HTMLImageElement) => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "photo-pin";
  button.setAttribute("aria-label", pin.title);
  const frame = document.createElement("div");
  frame.className = "photo-frame shimmer";
  const image = document.createElement("img");
  image.className = "photo";
  image.src = photoUrl(pin.image!, 96);
  image.alt = "";
  image.onerror = () => image.remove();
  revealPhoto(image);
  frame.append(image);
  const name = document.createElement("span");
  name.textContent = capitalize(pin.title);
  button.append(frame, name);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(pin, image);
  });
  return button;
}

function hoverCard(pin: Pin) {
  const root = document.createElement("div");
  root.className = "pin-hover";
  const card = document.createElement("div");
  const bubble = document.createElement("div");
  bubble.className = `pin-hover-bubble ${pin.image ? "shimmer" : "no-photo"}`;
  if (pin.image) {
    const image = document.createElement("img");
    image.className = "photo";
    image.src = photoUrl(pin.image, HOVER_PHOTO_WIDTH);
    image.alt = "";
    image.onerror = () => image.remove();
    revealPhoto(image);
    bubble.append(image);
    // Warms the cache, so the modal photo is ready when the morph starts.
    new Image().src = photoUrl(pin.image, MODAL_PHOTO_WIDTH);
  }
  const name = document.createElement("span");
  name.textContent = capitalize(pin.title);
  card.append(bubble, name);
  root.append(card);
  return root;
}

export function Globe() {
  const t = useTranslations();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [layer, setLayer] = useState<MapStyleId>("satellite");
  const [selected, setSelected] = useState<Pin | null>(null);
  const [borders, setBorders] = useState<BorderId[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const stars = useMemo(() => `url("${starTile()}")`, []);
  const starsRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<Filters>({ rising: false, kinds: [], views: FULL_RANGE });
  // Read by style.load, which outlives any single render.
  const overlays = useRef({ borders, filters, layer });
  overlays.current = { borders, filters, layer };
  const [planner, setPlanner] = useState<PlannerPlace | null>(null);
  const [trip, setTrip] = useState<{ days: TripDay[]; name: string; saved: boolean } | null>(null);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>(() => loadTrips());
  const [savedOpen, setSavedOpen] = useState(false);
  const tripActive = useRef(false);
  tripActive.current = trip !== null;
  const destination = useRef<Destination | null>(null);
  const goTo = useCallback((place: Destination) => {
    destination.current = place;
    mapRef.current?.flyTo({
      center: [place.lon, place.lat],
      zoom: place.zoom,
      duration: 2600,
      essential: true,
    });
  }, []);
  const morphSource = useRef<HTMLImageElement | null>(null);
  const hover = useRef({ pinned: false, clear: () => {} });

  const openPlace = useCallback(async (pin: Pin, image: HTMLImageElement | null) => {
    morphSource.current = image;
    hover.current.pinned = true;
    await photoReady(image);
    namePhoto(image, true);
    await morph("open", () => {
      namePhoto(image, false);
      setSelected(pin);
    });
    // The transition drops the WebGL frame: without a redraw the globe stays blank.
    mapRef.current?.triggerRepaint();
  }, []);

  const closePlace = useCallback(async () => {
    const image = morphSource.current?.isConnected ? morphSource.current : null;
    await morph("close", () => {
      setSelected(null);
      namePhoto(image, true);
    });
    namePhoto(image, false);
    mapRef.current?.triggerRepaint();
    hover.current.pinned = false;
    hover.current.clear();
  }, []);

  useEffect(() => {
    maplibregl.setWorkerUrl(`${window.location.origin}/maplibre-gl-worker.mjs`);
    const map = new maplibregl.Map({
      container: container.current!,
      style: MAP_STYLES.satellite.style,
      // An explicit start position wins over the URL hash.
      ...(window.location.hash ? {} : { center: [8, 30] as [number, number], zoom: 1.6 }),
      maxZoom: 19,
      hash: true,
      attributionControl: { compact: true },
      // Phones have 3x screens: the extra pixels cost frames for no visible gain on a map.
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      fadeDuration: 100,
      touchPitch: false,
      clickTolerance: 6,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.GlobeControl(), "bottom-right");

    // A new style drops every source, so overlays go back on after each layer switch.
    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
      const { borders, filters, layer } = overlays.current;
      addBorders(map, borders, MAP_STYLES[layer].borderColor);
      addPins(map, filters);
      hiddenPins = "";
    });
    let hiddenPins = "";
    let hovered: { id: number; marker: maplibregl.Marker } | null = null;
    const clearHover = () => {
      // The open modal flies back to this photo when it closes.
      if (hover.current.pinned) return;
      hovered?.marker.remove();
      hovered = null;
      map.getCanvas().style.cursor = "";
    };
    hover.current.clear = clearHover;
    const showHover = (pin: Pin, lngLat: [number, number]) => {
      clearHover();
      map.getCanvas().style.cursor = "pointer";
      const marker = new maplibregl.Marker({ element: hoverCard(pin), anchor: "bottom" })
        .setLngLat(lngLat)
        .addTo(map);
      hovered = { id: pin.id, marker };
      return marker;
    };
    const touch = window.matchMedia("(pointer: coarse)").matches;
    map.on("click", (event) => {
      setFiltersOpen(false);
      const { x, y } = event.point;
      const hit = touch ? TOUCH_HIT_PX : MOUSE_HIT_PX;
      const [feature] = map
        .queryRenderedFeatures(
          [
            [x - hit, y - hit],
            [x + hit, y + hit],
          ],
          { layers: ["pins"] },
        )
        .sort((a, b) => b.properties.views - a.properties.views);
      if (feature?.geometry.type !== "Point") return;
      const pin = feature.properties as Pin;
      // On a phone there is no hover: the card appears under the finger, then flies.
      const marker =
        hovered?.id === pin.id
          ? hovered.marker
          : showHover(pin, feature.geometry.coordinates as [number, number]);
      void openPlace(pin, marker.getElement().querySelector("img"));
    });
    map.on("dragstart", () => setFiltersOpen(false));
    map.on("move", () => {
      const { lng, lat } = map.getCenter();
      const position = `${-lng * STAR_PARALLAX}px ${lat * STAR_PARALLAX}px`;
      starsRef.current?.style.setProperty("--stars-position", position);
    });
    map.on("mousemove", "pins", (event) => {
      const feature = event.features?.[0];
      if (feature?.geometry.type !== "Point") return;
      const pin = feature.properties as Pin;
      if (hovered?.id !== pin.id) showHover(pin, feature.geometry.coordinates as [number, number]);
    });
    map.on("mouseleave", "pins", clearHover);

    const photos = new Map<number, maplibregl.Marker>();
    map.on("idle", () => {
      const pins = new Map<number, { pin: Pin; lngLat: [number, number] }>();
      if (map.getLayer("pins-query") && !tripActive.current) {
        const features = map.queryRenderedFeatures({ layers: ["pins-query"] });
        for (const feature of features) {
          const pin = feature.properties as Pin;
          if (pin.image && feature.geometry.type === "Point") {
            pins.set(pin.id, { pin, lngLat: feature.geometry.coordinates as [number, number] });
          }
        }
      }
      const ranked = [...pins.values()].sort((a, b) => b.pin.views - a.pin.views);
      const shown: typeof ranked = [];
      const zoom = map.getZoom();
      const count = PHOTO_LIMITS.find(([below]) => zoom < below)?.[1] ?? 0;
      const limit = touch ? Math.ceil(count / 2) : count;
      const { lng, lat } = map.getCenter();
      for (const candidate of ranked) {
        if (shown.length === limit) break;
        const [lon, placeLat] = candidate.lngLat;
        const distance = km({ lat, lon: lng }, { lat: placeLat, lon });
        if (zoom < HORIZON_ZOOM && distance > VISIBLE_HORIZON_KM) continue;
        const point = map.project(candidate.lngLat);
        const clear = shown.every(
          ({ lngLat }) => map.project(lngLat).dist(point) >= PHOTO_SPACING_PX,
        );
        if (clear) shown.push(candidate);
      }
      const keep = new Set(shown.map(({ pin }) => pin.id));
      for (const [id, marker] of photos) {
        if (!keep.has(id)) {
          marker.remove();
          photos.delete(id);
        }
      }
      for (const { pin, lngLat } of shown) {
        if (photos.has(pin.id)) continue;
        const marker = new maplibregl.Marker({
          element: photoMarker(pin, (place, image) => void openPlace(place, image)),
          anchor: "top",
          offset: [0, -PHOTO_RADIUS_PX],
        });
        photos.set(pin.id, marker.setLngLat(lngLat).addTo(map));
      }
      const ids = shown.map(({ pin }) => pin.id).sort((a, b) => a - b);
      const key = ids.join();
      if (key !== hiddenPins) {
        hiddenPins = key;
        hidePins(map, ids);
      }
    });

    return () => {
      // remove() clears the URL hash, which would lose the position on the Strict Mode remount.
      const { hash } = window.location;
      map.remove();
      window.history.replaceState(window.history.state, "", hash);
    };
  }, [openPlace]);

  useEffect(() => {
    const source = mapRef.current?.getSource<maplibregl.VectorTileSource>("places");
    source?.setTiles([tilesUrl(filters)]);
  }, [filters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("admin")) return;
    for (const id of Object.keys(BORDERS)) {
      const visible = borders.includes(id as BorderId) ? "visible" : "none";
      map.setLayoutProperty(`border-${id}`, "visibility", visible);
    }
  }, [borders]);

  const changeLayer = (next: string) => {
    if (!next) return;
    setLayer(next as MapStyleId);
    // Without diff: false, MapLibre merges styles and keeps the previous overlays.
    mapRef.current?.setStyle(MAP_STYLES[next as MapStyleId].style, { diff: false });
  };

  const saveCurrentTrip = async () => {
    if (!trip) return;
    const stops = trip.days.flatMap((day) => day.stops);
    await saveTrip(
      { name: trip.name, days: trip.days },
      {
        tiles: tileUrls(trip.days, SATELLITE_TILES),
        photos: stops.flatMap((stop) =>
          stop.image ? [photoUrl(stop.image, 96), photoUrl(stop.image, 240)] : [],
        ),
        texts: stops.map(summaryUrl),
      },
    );
    setSavedTrips(loadTrips());
    setTrip({ ...trip, saved: true });
  };

  const openPlanner = () => {
    const center = mapRef.current?.getCenter();
    if (!center) return;
    const here = { lat: center.lat, lon: center.lng, zoom: mapRef.current?.getZoom() ?? 12 };
    const place = destination.current;
    // The last search names the trip, as long as the map is still looking at it.
    const near = place && km(place, here) < SAME_PLACE_KM;
    setPlanner(near ? place : { ...here, label: null });
  };

  const activeCount =
    filters.kinds.length +
    borders.length +
    Number(filters.rising) +
    Number(filters.views[0] !== FULL_RANGE[0] || filters.views[1] !== FULL_RANGE[1]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-black" data-trip={trip !== null}>
      <div
        ref={starsRef}
        className="stars"
        style={{ "--stars": stars } as React.CSSProperties}
        aria-hidden
      />
      <div ref={container} className="size-full" aria-label={t("map.label")} />
      <SearchBar onPick={goTo} />
      <FiltersPanel
        open={filtersOpen}
        activeCount={activeCount}
        onToggle={() => setFiltersOpen(!filtersOpen)}
      >
        <ToggleGroup
          type="single"
          size="sm"
          value={layer}
          onValueChange={changeLayer}
          aria-label={t("map.styles.label")}
          className="flex-wrap"
        >
          {Object.keys(MAP_STYLES).map((id) => (
            <ToggleGroupItem key={id} value={id}>
              {t(`map.styles.${id}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          type="multiple"
          size="sm"
          value={borders}
          onValueChange={(next) => setBorders(next as BorderId[])}
          aria-label={t("map.borders.label")}
          className="flex-wrap"
        >
          {Object.keys(BORDERS).map((id) => (
            <ToggleGroupItem key={id} value={id}>
              {t(`map.borders.${id}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Toggle
          size="sm"
          pressed={filters.rising}
          onPressedChange={(rising) => setFilters({ ...filters, rising })}
          aria-label={t("filters.trendingLabel")}
          className="self-start"
        >
          <TrendingUpIcon />
          {t("filters.trending")}
        </Toggle>
        <PopularityFilter
          value={filters.views}
          onChange={(views) => setFilters({ ...filters, views })}
        />
        <ToggleGroup
          type="multiple"
          size="sm"
          value={filters.kinds}
          onValueChange={(kinds) => setFilters({ ...filters, kinds: kinds as Kind[] })}
          aria-label={t("filters.kindsLabel")}
          className="flex-wrap"
        >
          {KIND_IDS.map((id) => (
            <ToggleGroupItem key={id} value={id}>
              {t(`filters.kinds.${id}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FiltersPanel>
      <div className="tool tool-trip">
        <Button variant="ghost" size="icon" onClick={openPlanner} aria-label={t("trip.open")}>
          <RouteIcon />
        </Button>
      </div>
      {savedTrips.length > 0 && (
        <div className="tool tool-saved">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSavedOpen(true)}
            aria-label={t("trip.mine")}
          >
            <BookmarkIcon />
          </Button>
        </div>
      )}
      {planner && (
        <TripPlanner
          open
          place={planner}
          onOpenChange={(open) => !open && setPlanner(null)}
          onReady={(days, name) => {
            setPlanner(null);
            setTrip({ days, name, saved: false });
          }}
        />
      )}
      {savedOpen && (
        <SavedTrips
          trips={savedTrips}
          onOpenChange={setSavedOpen}
          onOpen={({ days, name }) => {
            setSavedOpen(false);
            setTrip({ days, name, saved: true });
          }}
          onDelete={async ({ id }) => {
            await deleteTrip(id);
            const left = loadTrips();
            setSavedTrips(left);
            if (!left.length) setSavedOpen(false);
          }}
        />
      )}
      {trip && mapRef.current && (
        <TripPlayer
          key={trip.name}
          map={mapRef.current}
          days={trip.days}
          name={trip.name}
          saved={trip.saved}
          onSave={saveCurrentTrip}
          onClose={() => setTrip(null)}
        />
      )}
      <PlaceModal pin={selected} onClose={closePlace} />
    </main>
  );
}
