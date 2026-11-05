"use client";

import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SavedTrip } from "@/lib/trip/saved";

type Props = {
  trips: SavedTrip[];
  onOpenChange: (open: boolean) => void;
  onOpen: (trip: SavedTrip) => void;
  onDelete: (trip: SavedTrip) => void;
};

export function SavedTrips({ trips, onOpenChange, onOpen, onDelete }: Props) {
  const t = useTranslations("trip");
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("savedTitle")}</DialogTitle>
          <DialogDescription>{t("savedHelp")}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {trips.map((trip) => (
            <li key={trip.id} className="flex items-center gap-2">
              <Button variant="outline" className="min-w-0 flex-1" onClick={() => onOpen(trip)}>
                <span className="truncate">{trip.name}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(trip)}
                aria-label={t("delete", { name: trip.name })}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
