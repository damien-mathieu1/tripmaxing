"use client";

import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import * as maplibregl from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type Coordinate, lengthKm, pointAlong, sliceAlong } from "@/lib/trip/path";
import type { TripDay } from "@/lib/trip/walking";
import { capitalize } from "@/lib/utils";
import { PlaceSummary } from "../globe/place-modal";
import { type Pin, photoUrl, revealPhoto } from "../globe/pin";
import { formatDuration } from "./trip-planner";
import { walkerElement } from "./walker";

const STOP_ZOOM = 16;
const CAMERA_MS = 1100;
const MS_PER_KM = 7000;
const MIN_WALK_MS = 3500;
const MAX_WALK_MS = 11000;
// Share of the arc where the camera leans towards the middle of the leg rather than the walker.
const CAMERA_LEAD = 0.75;
const TRIP_PADDING = { top: 70, bottom: 260, left: 40, right: 40 };
const DIMMED_PINS = 0.3;

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
// Mostly a steady pace, with a soft start and stop.
const pace = (t: number) => 0.75 * t + 0.25 * t * t * (3 - 2 * t);
const emptyLine = (coordinates: Coordinate[]) =>
  ({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  }) as const;

function moved(map: maplibregl.Map, start: () => void, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    map.once("moveend", () => {
      clearTimeout(timer);
      resolve();
    });
    start();
  });
}

function animate(durationMs: number, frame: (progress: number) => void, stale: () => boolean) {
  return new Promise<void>((resolve) => {
    const started = performance.now();
    const tick = (now: number) => {
      if (stale()) return resolve();
      const progress = Math.min(1, (now - started) / durationMs);
      frame(progress);
      if (progress < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

function drawRoute(map: maplibregl.Map, day: TripDay) {
  for (const id of ["trip-walked", "trip-route", "trip-route-glow"]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of ["trip-path", "trip-progress"]) {
    if (map.getSource(id)) map.removeSource(id);
  }
  map.addSource("trip-path", { type: "geojson", data: emptyLine(day.legs.flat()) });
  map.addSource("trip-progress", {
    type: "geojson",
    lineMetrics: true,
    data: emptyLine(day.legs[0]?.slice(0, 1) ?? []),
  });
  const round = { "line-cap": "round", "line-join": "round" } as const;
  map.addLayer({
    id: "trip-route-glow",
    type: "line",
    source: "trip-path",
    layout: round,
    paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.35, "line-blur": 3 },
  });
  map.addLayer({
    id: "trip-route",
    type: "line",
    source: "trip-path",
    layout: round,
    paint: { "line-color": "#ffffff", "line-width": 2.5, "line-dasharray": [0.5, 2.2] },
  });
  map.addLayer({
    id: "trip-walked",
    type: "line",
    source: "trip-progress",
    layout: round,
    paint: {
      "line-width": 6,
      "line-gradient": [
        "interpolate",
        ["linear"],
        ["line-progress"],
        0,
        "#fb7185",
        0.6,
        "#f97316",
        1,
        "#facc15",
      ],
    },
  });
}

function stopMarker(day: TripDay, index: number, onClick: () => void) {
  const stop = day.stops[index];
  const button = document.createElement("button");
  button.type = "button";
  button.className = "trip-stop";
  button.setAttribute("aria-label", stop.title);
  const frame = document.createElement("div");
  frame.className = `photo-frame ${stop.image ? "shimmer" : "no-photo"}`;
  if (stop.image) {
    const image = document.createElement("img");
    image.className = "photo";
    image.src = photoUrl(stop.image, 96);
    image.alt = "";
    image.onerror = () => image.remove();
    revealPhoto(image);
    frame.append(image);
  }
  const badge = document.createElement("span");
  badge.textContent = String(index + 1);
  button.append(frame, badge);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

type Props = {
  map: maplibregl.Map;
  days: TripDay[];
  onClose: () => void;
};

export function TripPlayer({ map, days, onClose }: Props) {
  const t = useTranslations("trip");
  const [dayIndex, setDayIndex] = useState(0);
  const [stopIndex, setStopIndex] = useState(0);
  const [walking, setWalking] = useState(false);
  const run = useRef(0);
  const walker = useRef<maplibregl.Marker | null>(null);
  const stopRef = useRef(0);
  const markers = useRef<maplibregl.Marker[]>([]);
  const day = days[dayIndex];
  const stop = day.stops[stopIndex];

  const showProgress = useCallback(
    (legs: Coordinate[][], leg: number, fraction: number) => {
      const source = map.getSource<maplibregl.GeoJSONSource>("trip-progress");
      const walked = [...legs.slice(0, leg).flat(), ...sliceAlong(legs[leg] ?? [], fraction)];
      source?.setData(emptyLine(walked));
    },
    [map],
  );

  const activate = useCallback((index: number) => {
    stopRef.current = index;
    setStopIndex(index);
    markers.current.forEach((marker, i) =>
      marker.getElement().toggleAttribute("data-active", i === index),
    );
  }, []);

  const walkTo = useCallback(
    async (target: number) => {
      const from = stopRef.current;
      if (target === from || target < 0 || target >= day.stops.length) return;
      const current = ++run.current;
      const stale = () => current !== run.current;
      const destination = day.stops[target];
      setWalking(true);

      const far = Math.abs(target - from) > 1;
      if (far) {
        activate(target);
        showProgress(day.legs, target, 0);
        walker.current?.setLngLat([destination.lon, destination.lat]);
      } else {
        const forward = target > from;
        const leg = Math.min(from, target);
        const path = day.legs[leg];
        const bounds = new maplibregl.LngLatBounds();
        for (const coordinate of path) bounds.extend(coordinate);
        const wide = map.cameraForBounds(bounds, { maxZoom: STOP_ZOOM });
        const startZoom = map.getZoom();
        const wideZoom = Math.min(startZoom, STOP_ZOOM, (wide?.zoom ?? STOP_ZOOM) - 0.2);
        const middle = bounds.getCenter();
        const element = walker.current?.getElement();
        element?.setAttribute("data-walking", "true");
        const duration = Math.min(MAX_WALK_MS, Math.max(MIN_WALK_MS, lengthKm(path) * MS_PER_KM));
        let previous = pointAlong(path, forward ? 0 : 1);
        // One motion: the camera rises and comes back down exactly as the walker crosses the leg.
        await animate(
          duration,
          (time) => {
            const progress = pace(time);
            const fraction = forward ? progress : 1 - progress;
            const position = pointAlong(path, fraction);
            walker.current?.setLngLat(position);
            if (position[0] !== previous[0]) {
              element?.toggleAttribute("data-left", position[0] < previous[0]);
            }
            previous = position;
            showProgress(day.legs, leg, fraction);
            const arc = Math.sin(Math.PI * time);
            const lead = arc * CAMERA_LEAD;
            const landing = lerp(startZoom, STOP_ZOOM, time);
            map.jumpTo({
              center: [lerp(position[0], middle.lng, lead), lerp(position[1], middle.lat, lead)],
              zoom: lerp(landing, wideZoom, arc),
            });
          },
          stale,
        );
        element?.removeAttribute("data-walking");
        if (stale()) return;
        activate(target);
      }

      // Paths end on the nearest footway: this last nudge is only a few metres.
      await moved(
        map,
        () =>
          map.easeTo({
            center: [destination.lon, destination.lat],
            zoom: STOP_ZOOM,
            duration: far ? CAMERA_MS : 350,
            essential: true,
          }),
        CAMERA_MS + 400,
      );
      walker.current?.setLngLat([destination.lon, destination.lat]);
      if (!stale()) setWalking(false);
    },
    [activate, day, map, showProgress],
  );

  const walkToRef = useRef(walkTo);
  walkToRef.current = walkTo;

  // Runs before the first flight below: setPadding stops any camera move in progress.
  useEffect(() => {
    map.setPadding(TRIP_PADDING);
    return () => {
      map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    };
  }, [map]);

  // Draws the day, and again after a base map change wipes the layers.
  useEffect(() => {
    const draw = () => {
      drawRoute(map, day);
      if (map.getLayer("pins")) map.setPaintProperty("pins", "icon-opacity", DIMMED_PINS);
      showProgress(day.legs, stopRef.current, 0);
    };
    map.on("style.load", draw);
    try {
      draw();
    } catch (error) {
      // A base map still loading refuses layers: the style.load above draws them moments later.
      if (!String(error).includes("Style is not done loading")) throw error;
    }

    const first = day.stops[0];
    markers.current = day.stops.map((place, index) =>
      new maplibregl.Marker({
        element: stopMarker(day, index, () => void walkToRef.current(index)),
      })
        .setLngLat([place.lon, place.lat])
        .addTo(map),
    );
    walker.current = new maplibregl.Marker({ element: walkerElement(), anchor: "bottom" })
      .setLngLat([first.lon, first.lat])
      .addTo(map);
    activate(0);
    run.current++;
    setWalking(false);
    map.flyTo({
      center: [first.lon, first.lat],
      zoom: STOP_ZOOM,
      duration: 2200,
      essential: true,
    });

    return () => {
      map.off("style.load", draw);
      run.current++;
      for (const marker of markers.current) marker.remove();
      walker.current?.remove();
    };
  }, [activate, day, map, showProgress]);

  useEffect(
    () => () => {
      for (const id of ["trip-walked", "trip-route", "trip-route-glow"]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of ["trip-path", "trip-progress"]) {
        if (map.getSource(id)) map.removeSource(id);
      }
      if (map.getLayer("pins")) map.setPaintProperty("pins", "icon-opacity", 1);
    },
    [map],
  );

  const pin: Pin = {
    ...stop,
    views: stop.views,
    trend: stop.trend ?? undefined,
    image: stop.image ?? undefined,
  };

  return (
    <section className="trip-card" aria-label={t("title")}>
      <div className="flex items-center justify-between gap-2">
        {days.length > 1 ? (
          <ToggleGroup
            type="single"
            size="sm"
            value={String(dayIndex)}
            onValueChange={(value) => value && setDayIndex(Number(value))}
            aria-label={t("title")}
            className="flex-wrap"
          >
            {days.map((_, index) => (
              <ToggleGroupItem key={index} value={String(index)}>
                {t("day", { day: index + 1 })}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("close")}>
          <XIcon />
        </Button>
      </div>

      <div className="flex gap-3" key={stop.id}>
        <div className={`trip-photo ${stop.image ? "shimmer" : "no-photo"}`}>
          {stop.image && (
            // oxlint-disable-next-line nextjs/no-img-element -- Commons serves resized images
            <img ref={revealPhoto} src={photoUrl(stop.image, 240)} alt="" className="photo" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            {t("stop", { current: stopIndex + 1, total: day.stops.length })}
            {" · "}
            {stopIndex === 0
              ? t("start")
              : t("legWalk", { minutes: day.legMinutes[stopIndex - 1] })}
          </p>
          <h2 className="truncate font-medium">{capitalize(stop.title)}</h2>
          <div className="trip-summary text-sm text-muted-foreground">
            <PlaceSummary pin={pin} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => void walkTo(stopIndex - 1)}
          disabled={stopIndex === 0}
          aria-label={t("previous")}
        >
          <ChevronLeftIcon />
        </Button>
        <div className="flex flex-col items-center">
          <p className="text-xs text-muted-foreground">
            {t("daySummary", {
              km: day.km.toFixed(1).replace(".", ","),
              time: formatDuration(day.walkMinutes),
            })}
          </p>
          {day.estimated && <p className="text-xs text-muted-foreground">{t("estimated")}</p>}
        </div>
        <Button
          size="icon"
          onClick={() => void walkTo(stopIndex + 1)}
          disabled={stopIndex === day.stops.length - 1}
          aria-label={t("next")}
          data-walking={walking}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </section>
  );
}
