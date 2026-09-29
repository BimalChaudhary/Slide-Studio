"use client";

import { selectCurrentSlide, useSlideStore } from "@/store/slideStore";
import SlideCanvas from "./SlideCanvas";

/** "Live preview" for the current slide. Background controls now live in ProjectBar. */
export default function SlideSettings() {
  const slide = useSlideStore(selectCurrentSlide);

  return (
    <aside>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Live preview
      </h3>
      <SlideCanvas slide={slide} mode="view" />
      <p className="mt-1 text-xs text-slate-500">
        Exactly what the presentation tab will show.
      </p>
    </aside>
  );
}
