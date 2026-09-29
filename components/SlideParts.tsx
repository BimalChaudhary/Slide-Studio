"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { Volume2, VolumeX } from "lucide-react";

import type { Slide, SlideElement } from "@/lib/types";
import { useAudioPrefs } from "@/lib/audioPrefs";

/**
 * thumb: static (no autoplay, no controls)
 * edit:  editor canvas (background video plays, element videos paused)
 * view:  presentation / live preview (background video plays, element videos have controls)
 */
export type Mode = "thumb" | "edit" | "view";

export const boxStyle = (el: SlideElement): CSSProperties => ({
  left: `${el.x}%`,
  top: `${el.y}%`,
  width: `${el.w}%`,
  height: `${el.h}%`,
});

export const textStyle = (el: SlideElement): CSSProperties => ({
  width: "100%",
  height: "100%",
  fontSize: `${el.fontSize ?? 2.6}cqw`,
  color: el.color ?? "#ffffff",
  fontWeight: el.bold ? 700 : 400,
  textAlign: el.align ?? "left",
  lineHeight: 1.25,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "Arial, Helvetica, sans-serif",
});

/**
 * Background video: behind everything, autoplay + loop + playsInline, covers the slide.
 * Mute state is per-slide (with a global default) and toggled by the viewer via the
 * speaker button — never hardcoded, so sound is always in the user's hands.
 */
function BackgroundVideo({
  slideId,
  url,
  mode,
}: {
  slideId: string;
  url: string;
  mode: Mode;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const muted = useAudioPrefs((s) => s.isMuted(slideId));
  const toggleSlide = useAudioPrefs((s) => s.toggleSlide);

  // Start playback once. Muted state is applied in the effect below, and kept in sync
  // even though we also pass `muted` as a prop (React's muted attribute alone is unreliable).
  useEffect(() => {
    const v = ref.current;
    if (!v || mode === "thumb") return;
    v.muted = muted;
    void v.play().catch(() => undefined); // autoplay can be refused by the browser; not an error
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the source changes
  }, [url, mode]);

  // Keep the live <video> element's mute state in sync whenever the user toggles it.
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  return (
    <div className="absolute inset-0">
      <video
        ref={ref}
        src={mode === "thumb" ? `${url}#t=0.1` : url}
        autoPlay={mode !== "thumb"}
        loop
        muted={muted}
        playsInline
        preload="auto"
        className="h-full w-full object-cover"
      />
      {mode !== "thumb" && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleSlide(slideId);
          }}
          title={muted ? "Unmute background video" : "Mute background video"}
          aria-label={
            muted ? "Unmute background video" : "Mute background video"
          }
          className="absolute bottom-2 right-2 z-10 rounded-full bg-black/60 p-1.5 text-white backdrop-blur transition hover:bg-black/80"
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      )}
    </div>
  );
}

export function SlideBackground({ slide, mode }: { slide: Slide; mode: Mode }) {
  const m = slide.bgType === "media" ? slide.bgMedia : undefined;
  const base: CSSProperties =
    slide.bgType === "gradient"
      ? {
          background: `linear-gradient(135deg, ${slide.gradientFrom}, ${slide.gradientTo})`,
        }
      : { background: slide.bgColor };

  return (
    <div className="absolute inset-0" style={base}>
      {m?.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.url}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      )}
      {m?.kind === "video" && (
        <BackgroundVideo
          key={m.url}
          slideId={slide.id}
          url={m.url}
          mode={mode}
        />
      )}
    </div>
  );
}

export function ElementView({ el, mode }: { el: SlideElement; mode: Mode }) {
  if (el.type === "text") return <div style={textStyle(el)}>{el.text}</div>;
  if (!el.url) return null;
  if (el.type === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={el.url}
        alt=""
        draggable={false}
        className="h-full w-full object-contain"
      />
    );
  return (
    <video
      key={el.url}
      src={mode === "view" ? el.url : `${el.url}#t=0.1`}
      controls={mode === "view"}
      preload="metadata"
      playsInline
      className="h-full w-full object-contain"
    />
  );
}
