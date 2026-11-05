"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { capitalize } from "@/lib/utils";
import { HOVER_PHOTO_WIDTH, MODAL_PHOTO_WIDTH } from "./morph";
import { type Pin, isRising, photoUrl, revealPhoto, summaryUrl, wikipediaUrl } from "./pin";

/** Texts stay out of the database: they load from Wikipedia when a place opens. */
export function PlaceSummary({ pin }: { pin: Pin }) {
  const t = useTranslations("place");
  const [summary, setSummary] = useState<string | null>(null);
  const fallback = t("fallback");

  useEffect(() => {
    const controller = new AbortController();
    fetch(summaryUrl(pin), { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((page) => setSummary(page?.extract || page?.description || fallback))
      .catch((error) => {
        if (error.name !== "AbortError") setSummary(fallback);
      });
    return () => controller.abort();
  }, [pin, fallback]);

  if (summary === null) {
    return (
      <div className="bones" aria-label={t("loading")}>
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  return <p className="summary line-clamp-5 text-sm text-muted-foreground">{summary}</p>;
}

export function PlaceModal({ pin, onClose }: { pin: Pin | null; onClose: () => void }) {
  const t = useTranslations("place");
  return (
    <Dialog open={pin !== null} onOpenChange={(open) => !open && onClose()}>
      {pin && (
        <DialogContent
          data-place-modal
          aria-describedby={undefined}
          className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          {pin.image && (
            <div
              className="place-modal-photo shimmer aspect-video w-full overflow-hidden"
              // The small hover photo is cached: it shows until the big one arrives.
              style={{ backgroundImage: `url("${photoUrl(pin.image, HOVER_PHOTO_WIDTH)}")` }}
            >
              {/* oxlint-disable-next-line nextjs/no-img-element -- Commons serves resized images */}
              <img
                ref={revealPhoto}
                src={photoUrl(pin.image, MODAL_PHOTO_WIDTH)}
                alt={pin.title}
                className="photo size-full object-cover"
              />
            </div>
          )}
          <div className="flex flex-col gap-4 p-5">
            <DialogHeader>
              <DialogTitle>{capitalize(pin.title)}</DialogTitle>
              <DialogDescription asChild>
                <div>
                  <PlaceSummary pin={pin} />
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{t("views", { views: pin.views })}</Badge>
              {pin.family && <Badge variant="outline">{capitalize(pin.family)}</Badge>}
              {isRising(pin) && <Badge>{t("rising")}</Badge>}
            </div>
            <Button asChild>
              <a href={wikipediaUrl(pin)} target="_blank" rel="noopener noreferrer">
                {t("read")}
                <ExternalLinkIcon />
              </a>
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
