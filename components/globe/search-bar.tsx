"use client";

import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { type SearchHit, toHits, zoomFor } from "@/lib/places/search";
import { capitalize } from "@/lib/utils";

const DEBOUNCE_MS = 220;
const WIKIDATA = "https://www.wikidata.org/w/api.php";

export type Destination = { label: string; lat: number; lon: number; zoom: number };
type Result = SearchHit & { lat: number; lon: number };

/** Wikidata ranks the names, our table keeps those with coordinates: nothing extra to store. */
async function search(query: string, signal: AbortSignal): Promise<Result[]> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: query,
    language: "fr",
    uselang: "fr",
    type: "item",
    limit: "10",
    format: "json",
    origin: "*",
  });
  const answer = await fetch(`${WIKIDATA}?${params}`, { signal }).then((r) => r.json());
  const hits = toHits(answer.search ?? []);
  if (!hits.length) return [];
  const places: { id: number; lat: number; lon: number }[] = await fetch(
    `/api/places?ids=${hits.map((hit) => hit.id).join(",")}`,
    { signal },
  ).then((r) => r.json());
  const byId = new Map(places.map((place) => [place.id, place]));
  return hits.flatMap((hit) => {
    const place = byId.get(hit.id);
    return place ? [{ ...hit, lat: place.lat, lon: place.lon }] : [];
  });
}

type PlaceSearchProps = {
  onPick: (destination: Destination) => void;
  onActive?: (active: boolean) => void;
};

export function PlaceSearch({ onPick, onActive }: PlaceSearchProps) {
  const t = useTranslations("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => onActive?.(status !== "idle"), [onActive, status]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const controller = new AbortController();
    const timer = setTimeout(() => {
      search(query, controller.signal)
        .then((found) => {
          setResults(found);
          setStatus("done");
        })
        .catch((error) => {
          if (error.name !== "AbortError") setStatus("done");
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pick = (result: Result) => {
    setQuery("");
    onPick({
      label: capitalize(result.label),
      lat: result.lat,
      lon: result.lon,
      zoom: zoomFor(result.description),
    });
  };

  return (
    <div>
      <Command shouldFilter={false} label={t("label")}>
        <CommandInput value={query} onValueChange={setQuery} placeholder={t("placeholder")} />
        {status !== "idle" && (
          <CommandList>
            {status === "loading" && !results.length && (
              <div className="search-bones" aria-label={t("loading")}>
                <span />
                <span />
                <span />
              </div>
            )}
            {status === "done" && !results.length && <p className="search-empty">{t("empty")}</p>}
            {results.map((result) => (
              <CommandItem key={result.id} value={String(result.id)} onSelect={() => pick(result)}>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{capitalize(result.label)}</span>
                  <small className="truncate text-muted-foreground">
                    {capitalize(result.description)}
                  </small>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        )}
      </Command>
    </div>
  );
}

export function SearchBar({ onPick }: { onPick: (destination: Destination) => void }) {
  const t = useTranslations("search");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector("input")?.focus();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div
      ref={root}
      className="search"
      data-open={open}
      onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
    >
      {open ? (
        <PlaceSearch
          onPick={(place) => {
            setOpen(false);
            onPick(place);
          }}
        />
      ) : (
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t("open")}>
          <SearchIcon />
        </Button>
      )}
    </div>
  );
}
