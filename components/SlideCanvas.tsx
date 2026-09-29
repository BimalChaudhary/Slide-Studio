"use client";

import type { Slide } from "@/lib/types";
import { ElementView, Mode, SlideBackground, boxStyle } from "./SlideParts";

/** Read-only render of a slide. Used for thumbnails, the live preview and the presentation. */
export default function SlideCanvas({
  slide, mode = "thumb", flat = false,
}: { slide: Slide; mode?: Mode; flat?: boolean }) {
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden ${flat ? "" : "rounded-lg shadow-xl"}`}
      style={{ containerType: "inline-size" }}
    >
      <SlideBackground slide={slide} mode={mode} />
      {slide.elements.map((el) => (
        <div key={el.id} className="absolute" style={boxStyle(el)}>
          <ElementView el={el} mode={mode} />
        </div>
      ))}
    </div>
  );
}
