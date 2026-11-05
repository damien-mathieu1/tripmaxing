import { flushSync } from "react-dom";

export const HOVER_PHOTO_WIDTH = 160;
export const MODAL_PHOTO_WIDTH = 800;

const PHOTO_TRANSITION = "place-photo";

type Phase = "open" | "close";

export const namePhoto = (image: HTMLImageElement | null, named: boolean) => {
  if (image) image.style.viewTransitionName = named ? PHOTO_TRANSITION : "";
};

/** Runs a state change as a view transition, so the photo flies between pin and modal. */
export async function morph(phase: Phase, update: () => void) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduced) {
    update();
    return;
  }
  document.documentElement.dataset.morph = phase;
  await document.startViewTransition(() => flushSync(update)).finished;
}
