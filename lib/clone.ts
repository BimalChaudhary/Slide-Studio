import type { PresentationState, Slide } from "./types";

/**
 * Independent copy of a slide list. Every slide, element and background object is a new object,
 * so later edits to one copy can never leak into the other.
 * `File` objects are immutable blobs, so they are shared on purpose (no data is duplicated and the
 * object URLs that point at them stay valid).
 */
export function cloneSlides(slides: Slide[]): Slide[] {
  return slides.map((s) => ({
    ...s,
    elements: s.elements.map((e) => ({ ...e })),
    bgMedia: s.bgMedia ? { ...s.bgMedia } : undefined,
  }));
}

export const clonePresentation = (p: PresentationState): PresentationState => ({
  slides: cloneSlides(p.slides),
  activeSlideId: p.activeSlideId,
});

/** The given id if it exists in `slides`, otherwise the first slide (or null when there are none). */
export const validSlideId = (slides: Slide[], id: string | null | undefined): string | null =>
  id && slides.some((s) => s.id === id) ? id : slides[0]?.id ?? null;
