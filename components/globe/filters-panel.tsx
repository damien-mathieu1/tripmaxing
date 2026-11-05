"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  activeCount: number;
  onToggle: () => void;
  children: ReactNode;
};

export function FiltersPanel({ open, activeCount, onToggle, children }: Props) {
  const t = useTranslations("filters");
  return (
    <section className="filters" data-open={open} aria-label={t("label")}>
      <Button
        variant="ghost"
        size={open ? "sm" : "icon"}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={t("open")}
      >
        <SlidersHorizontalIcon />
        {open && t("open")}
      </Button>
      {activeCount > 0 && (
        <span className="filters-count">
          <Badge>{activeCount}</Badge>
        </span>
      )}
      <div className="filters-body">
        <div className="filters-content" inert={!open}>
          {children}
        </div>
      </div>
    </section>
  );
}
