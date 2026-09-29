"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize } from "lucide-react";
import SlideCanvas from "./SlideCanvas";
import { loadPersistedRaw } from "@/lib/db";
import {
  fromLiteSlide,
  mediaIdsOf,
  sanitizeLite,
  type LitePresentation,
} from "@/lib/lite";
import { pruneUrls } from "@/lib/mediaUrls";
import {
  CHANNEL,
  readPreviewMode,
  supportsBroadcast,
  type SyncMessage,
} from "@/lib/sync";
import type { PreviewMode } from "@/lib/types";
import { MuteAllButton } from "./Button/MuteAllButton";

interface View {
  mode: PreviewMode;
  current: LitePresentation;
  saved: LitePresentation;
  live: boolean; // true once the editor has sent us its state
}

const HELLO_RETRY_MS = 4000;

/**
 * DISPLAY-ONLY second screen. It never edits or navigates: the editor tab decides the mode, the
 * slide and the content. This component only receives state and renders it.
 */
export default function SecondScreen() {
  const [view, setView] = useState<View | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const media = useRef(new Map<string, File>());
  const liveRef = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let channel: BroadcastChannel | null = null;
    let retry: number | undefined;

    // 1) Recover instantly from disk (works after a refresh, even if the editor is closed).
    loadPersistedRaw()
      .then((raw) => {
        if (disposed || liveRef.current) return;
        const saved = raw.saved ?? raw.draft?.presentation ?? null;
        const current = raw.draft?.presentation ?? raw.saved ?? null;
        if (saved && current) {
          raw.media.forEach((f, id) => media.current.set(id, f));
          setView({ mode: readPreviewMode(), current, saved, live: false });
        }
      })
      .catch(() => undefined)
      .finally(() => !disposed && setLoaded(true));

    // 2) Listen to the editor and ask it for the full state right away.
    if (supportsBroadcast()) {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (ev: MessageEvent<SyncMessage>) => {
        const m = ev.data;
        try {
          if (
            m?.type === "media" &&
            typeof m.id === "string" &&
            m.file instanceof Blob
          ) {
            media.current.set(m.id, m.file as File);
          } else if (m?.type === "state") {
            const current = sanitizeLite(m.current);
            const saved = sanitizeLite(m.saved);
            if (!current || !saved) return;
            // Drop media (and object URLs) that neither presentation uses any more.
            const used = mediaIdsOf(saved, mediaIdsOf(current));
            const keep = new Set<File>();
            for (const id of Array.from(media.current.keys())) {
              if (used.has(id)) keep.add(media.current.get(id)!);
              else media.current.delete(id);
            }
            pruneUrls(keep);
            liveRef.current = true;
            setView({
              mode: m.mode === "saved" ? "saved" : "current",
              current,
              saved,
              live: true,
            });
          }
        } catch (err) {
          console.error("Ignoring a malformed sync message:", err);
        }
      };
      const hello = () =>
        channel?.postMessage({ type: "hello" } satisfies SyncMessage);
      hello();
      retry = window.setInterval(() => {
        if (!liveRef.current) hello();
      }, HELLO_RETRY_MS);
    }

    return () => {
      disposed = true;
      if (retry !== undefined) window.clearInterval(retry);
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
    };
  }, []);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void boxRef.current?.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f") toggleFs();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFs]);

  // The slide to show: Current mode -> current state + current active slide;
  //                    Saved mode   -> saved snapshot + the slide that was active when it was saved.
  const slide = useMemo(() => {
    if (!view) return null;
    const p = view.mode === "saved" ? view.saved : view.current;
    const ls = p.slides.find((s) => s.id === p.activeSlideId) ?? p.slides[0];
    return ls ? fromLiteSlide(ls, (id) => media.current.get(id)) : null;
  }, [view]);

  const label = view?.mode === "saved" ? "Saved" : "Current";

  return (
    <div
      ref={boxRef}
      className="relative flex min-h-screen w-full items-center justify-center bg-black"
    >
      {slide ? (
        <div
          className="relative aspect-video overflow-hidden"
          style={{ width: "min(100vw, calc(100vh * 16 / 9))" }}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={slide.id}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: "easeInOut" }}
            >
              <SlideCanvas slide={slide} mode="view" flat />
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <p
          className="px-6 text-center text-slate-400"
          data-testid="second-screen-empty"
        >
          {!loaded
            ? "Loading…"
            : supportsBroadcast()
              ? "Waiting for the editor… open the editor tab and this screen will connect automatically."
              : "This browser does not support live sync between tabs (BroadcastChannel)."}
        </p>
      )}

      {!isFs && (
        <div className="absolute left-3 top-3 flex items-center gap-2 opacity-60 transition hover:opacity-100">
          {view && (
            <span
              data-testid="second-screen-badge"
              className="rounded-full bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-100"
            >
              {label}
              {!view.live && " · editor not connected (last stored copy)"}
            </span>
          )}
          <button
            onClick={toggleFs}
            className="rounded-full bg-slate-900/80 p-1.5 text-slate-100 hover:bg-slate-700"
            title="Fullscreen (F)"
            aria-label="Fullscreen"
          >
            <Maximize size={14} />
          </button>
          <MuteAllButton />
        </div>
      )}
    </div>
  );
}
