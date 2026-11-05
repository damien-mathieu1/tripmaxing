"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PRESETS, type Range, SLIDER_MAX, viewsFilter } from "@/lib/places/popularity";

type Props = { value: Range; onChange: (range: Range) => void };

export function PopularityFilter({ value, onChange }: Props) {
  const t = useTranslations("popularity");
  // The label follows the thumb, tiles only reload on release.
  const [draft, setDraft] = useState(value);
  const [dragging, setDragging] = useState(false);
  const apply = (range: Range) => {
    setDraft(range);
    onChange(range);
  };
  const preset = Object.entries(PRESETS).find(
    ([, range]) => range[0] === draft[0] && range[1] === draft[1],
  )?.[0];

  const { minViews: min, maxViews: max } = viewsFilter(draft);
  const label =
    min === undefined
      ? max === undefined
        ? t("all")
        : t("upTo", { max })
      : max === undefined
        ? t("from", { min })
        : t("between", { min, max });

  return (
    <div className="popularity flex flex-col gap-2 px-2 py-1" data-dragging={dragging}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <Slider
        min={0}
        max={SLIDER_MAX}
        step={1}
        value={draft}
        onPointerDown={() => setDragging(true)}
        onValueChange={(range) => setDraft(range as Range)}
        onValueCommit={(range) => {
          setDragging(false);
          onChange(range as Range);
        }}
        aria-label={t("sliderLabel")}
      />
      <ToggleGroup
        type="single"
        size="sm"
        value={preset ?? ""}
        onValueChange={(id) => apply(id ? PRESETS[id as keyof typeof PRESETS] : [0, SLIDER_MAX])}
        aria-label={t("presetsLabel")}
        className="flex-wrap"
      >
        {Object.keys(PRESETS).map((id) => (
          <ToggleGroupItem key={id} value={id}>
            {t(`presets.${id}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
