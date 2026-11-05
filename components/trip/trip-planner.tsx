"use client";

import { CheckIcon, MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PERIMETERS_KM, nearestPerimeter, tripRadiusKm } from "@/lib/places/search";
import { TRIP_TYPE_IDS, type TripType } from "@/lib/trip/interest";
import { order, walkMinutes } from "@/lib/trip/plan";
import type { Candidate } from "@/lib/trip/score";
import { type TripDay, walkDay } from "@/lib/trip/walking";
import { capitalize } from "@/lib/utils";
import { photoUrl, revealPhoto } from "../globe/pin";
import { type Destination, PlaceSearch } from "../globe/search-bar";
import { Walker } from "./walker";

const STYLES = { touristy: 0, mixed: 0.5, niche: 1 } as const;
const MIN_STOPS_PER_DAY = 2;

export type PlannerPlace = { label: string | null; lat: number; lon: number; zoom: number };

type Props = {
  open: boolean;
  place: PlannerPlace;
  onOpenChange: (open: boolean) => void;
  onReady: (days: TripDay[], name: string) => void;
};

type Step = "settings" | "suggesting" | "pick" | "routing";

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

function Suggestion({
  place,
  selected,
  index,
  onToggle,
}: {
  place: Candidate;
  selected: boolean;
  index: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="suggestion"
      aria-pressed={selected}
      onClick={onToggle}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className={`suggestion-photo ${place.image ? "shimmer" : "no-photo"}`}>
        {place.image && (
          // oxlint-disable-next-line nextjs/no-img-element -- Commons serves resized images
          <img ref={revealPhoto} src={photoUrl(place.image, 320)} alt="" className="photo" />
        )}
      </div>
      <p>{capitalize(place.title)}</p>
      <small>{capitalize(place.family)}</small>
      {selected && (
        <span className="suggestion-check">
          <CheckIcon size={14} />
        </span>
      )}
    </button>
  );
}

export function TripPlanner({ open, place: initialPlace, onOpenChange, onReady }: Props) {
  const t = useTranslations("trip");
  const [place, setPlace] = useState(initialPlace);
  const [searching, setSearching] = useState(!initialPlace.label);
  const [days, setDays] = useState(2);
  const [stops, setStops] = useState(5);
  const [offbeat, setOffbeat] = useState<number>(STYLES.mixed);
  const [maxWalk, setMaxWalk] = useState(120);
  const [types, setTypes] = useState<TripType[]>([]);
  const [perimeter, setPerimeter] = useState(() =>
    nearestPerimeter(tripRadiusKm(initialPlace.zoom, 2)),
  );
  const [step, setStep] = useState<Step>("settings");
  const [problem, setProblem] = useState<"empty" | "error" | null>(null);
  const [suggestions, setSuggestions] = useState<Candidate[][]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [day, setDay] = useState(0);

  const style = Object.entries(STYLES).find(([, value]) => value === offbeat)?.[0] ?? "";
  const picked = suggestions.map((list) => list.filter((stop) => chosen.has(stop.id)));
  const ready = picked.length > 0 && picked.every((list) => list.length >= MIN_STOPS_PER_DAY);
  const dayWalk = picked[day]?.length ? walkMinutes(order(picked[day])) : 0;

  const suggest = async () => {
    setStep("suggesting");
    setProblem(null);
    const query = new URLSearchParams({
      lat: String(place.lat),
      lon: String(place.lon),
      days: String(days),
      stops: String(stops),
      offbeat: String(offbeat),
      maxWalkMinutes: String(maxWalk),
      radiusKm: String(PERIMETERS_KM[perimeter]),
      suggest: "1",
    });
    if (types.length) query.set("types", types.join(","));
    try {
      const response = await fetch(`/api/trips?${query}`);
      if (!response.ok) throw new Error(String(response.status));
      const trip: { days: { stops: Candidate[] }[] } = await response.json();
      if (!trip.days.length) {
        setProblem("empty");
        setStep("settings");
        return;
      }
      setSuggestions(trip.days.map((plan) => plan.stops));
      setChosen(new Set());
      setDay(0);
      setStep("pick");
    } catch {
      setProblem("error");
      setStep("settings");
    }
  };

  const launch = async () => {
    setStep("routing");
    const walked = await Promise.all(picked.map((list) => walkDay(order(list))));
    onReady(walked, place.label ? t("name", { place: place.label }) : t("unnamed"));
  };

  const toggle = (id: number) => {
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const pickPlace = (destination: Destination) => {
    setPlace(destination);
    setPerimeter(nearestPerimeter(tripRadiusKm(destination.zoom, days)));
    setSearching(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={step === "pick" ? "sm:max-w-2xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{step === "pick" ? t("pick") : t("title")}</DialogTitle>
          <DialogDescription>
            {step === "pick"
              ? t("pickHelp", { count: stops })
              : t("around", { place: place.label ?? t("mapCenter") })}
          </DialogDescription>
        </DialogHeader>

        {(step === "suggesting" || step === "routing") && (
          <div className="trip-loading" role="status">
            <Walker />
            <p>{t(step === "routing" ? "loading" : "suggesting")}</p>
          </div>
        )}

        {step === "settings" && (
          <div className="trip-form flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-sm">{t("where")}</span>
              {searching ? (
                <div className="trip-where">
                  <PlaceSearch onPick={pickPlace} />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <MapPinIcon size={16} />
                    <span className="truncate">{place.label ?? t("mapCenter")}</span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setSearching(true)}>
                    {t("change")}
                  </Button>
                </div>
              )}
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-sm">{t("perimeter", { km: PERIMETERS_KM[perimeter] })}</span>
              <Slider
                min={0}
                max={PERIMETERS_KM.length - 1}
                step={1}
                value={[perimeter]}
                onValueChange={([value]) => setPerimeter(value)}
                aria-label={t("perimeter", { km: PERIMETERS_KM[perimeter] })}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm">{t("days", { count: days })}</span>
              <Slider
                min={1}
                max={7}
                step={1}
                value={[days]}
                onValueChange={([value]) => setDays(value)}
                aria-label={t("days", { count: days })}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm">{t("stops", { count: stops })}</span>
              <Slider
                min={2}
                max={8}
                step={1}
                value={[stops]}
                onValueChange={([value]) => setStops(value)}
                aria-label={t("stops", { count: stops })}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm">{t("maxWalk", { time: formatDuration(maxWalk) })}</span>
              <Slider
                min={30}
                max={300}
                step={15}
                value={[maxWalk]}
                onValueChange={([value]) => setMaxWalk(value)}
                aria-label={t("maxWalk", { time: formatDuration(maxWalk) })}
              />
            </label>
            <div className="flex flex-col gap-2">
              <ToggleGroup
                type="single"
                size="sm"
                value={style}
                onValueChange={(id) => id && setOffbeat(STYLES[id as keyof typeof STYLES])}
                aria-label={t("styleLabel")}
                className="flex-wrap"
              >
                {Object.keys(STYLES).map((id) => (
                  <ToggleGroupItem key={id} value={id}>
                    {t(`style.${id}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={[offbeat]}
                onValueChange={([value]) => setOffbeat(value)}
                aria-label={t("styleSlider")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm">{t("typesLabel")}</span>
              <ToggleGroup
                type="multiple"
                size="sm"
                value={types}
                onValueChange={(next) => setTypes(next as TripType[])}
                aria-label={t("typesLabel")}
                className="flex-wrap"
              >
                {TRIP_TYPE_IDS.map((id) => (
                  <ToggleGroupItem key={id} value={id}>
                    {t(`types.${id}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <small className="text-muted-foreground">{t("allTypes")}</small>
            </div>
            {problem && (
              <p className="text-sm text-muted-foreground" role="alert">
                {t(problem)}
              </p>
            )}
            <Button onClick={suggest}>{t("generate")}</Button>
          </div>
        )}

        {step === "pick" && (
          <div className="trip-form flex min-w-0 flex-col gap-3">
            {suggestions.length > 1 && (
              <ToggleGroup
                type="single"
                size="sm"
                value={String(day)}
                onValueChange={(value) => value && setDay(Number(value))}
                aria-label={t("title")}
                className="flex-wrap"
              >
                {suggestions.map((_, index) => (
                  <ToggleGroupItem key={index} value={String(index)}>
                    {t("day", { day: index + 1 })} ({picked[index].length})
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
            <div className="suggestions" key={day}>
              {suggestions[day].map((stop, index) => (
                <Suggestion
                  key={stop.id}
                  place={stop}
                  index={index}
                  selected={chosen.has(stop.id)}
                  onToggle={() => toggle(stop.id)}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("selected", { count: picked[day].length })}
              {dayWalk > 0 && ` · ${t("walkEstimate", { time: formatDuration(dayWalk) })}`}
              {dayWalk > maxWalk && `, ${t("tooMuch")}`}
            </p>
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("settings")}>
                {t("back")}
              </Button>
              <Button onClick={launch} disabled={!ready}>
                {ready ? t("launch") : t("needStops")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
