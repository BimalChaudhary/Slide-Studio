import { useSlideStore } from "@/store/slideStore";
import { validSlideId } from "./clone";
import { toLite, type LitePresentation } from "./lite";
import type { PreviewMode } from "./types";

export const CHANNEL = "slide-studio-sync-v1";
export const PREVIEW_MODE_KEY = "slide-studio:preview-mode";
export const SECOND_SCREEN_URL = "/present";

/**
 * Editor tab -> second screen. The second screen only ever sends "hello" (asking for a full
 * update); it never sends state back, so there is no way to create a sync loop.
 */
export type SyncMessage =
  | { type: "hello" }
  | { type: "media"; id: string; file: File }
  | { type: "state"; mode: PreviewMode; current: LitePresentation; saved: LitePresentation };

export const supportsBroadcast = () => typeof BroadcastChannel !== "undefined";

export function readPreviewMode(): PreviewMode {
  try {
    return localStorage.getItem(PREVIEW_MODE_KEY) === "saved" ? "saved" : "current";
  } catch {
    return "current"; // localStorage unavailable
  }
}

export function writePreviewMode(mode: PreviewMode) {
  try {
    localStorage.setItem(PREVIEW_MODE_KEY, mode);
  } catch {
    /* localStorage unavailable: the mode simply is not remembered */
  }
}

/** Start publishing the editor's Current + Saved state. Returns a cleanup function. */
export function startEditorSync(): () => void {
  if (!supportsBroadcast()) return () => undefined;
  const channel = new BroadcastChannel(CHANNEL);
  const sent = new Set<string>(); // media ids already sent
  let timer: number | undefined;

  const publish = () => {
    timer = undefined;
    try {
      const st = useSlideStore.getState();
      const files = new Map<string, File>();
      const current = toLite(
        { slides: st.slides, activeSlideId: validSlideId(st.slides, st.slideId) },
        files
      );
      const saved = toLite({ slides: st.savedSlides, activeSlideId: st.savedSlideId }, files);
      // Media first (once per file), then the small JSON state that refers to it.
      for (const [id, file] of files) {
        if (sent.has(id)) continue;
        channel.postMessage({ type: "media", id, file } satisfies SyncMessage);
        sent.add(id);
      }
      channel.postMessage({ type: "state", mode: st.previewMode, current, saved } satisfies SyncMessage);
    } catch (err) {
      console.error("Second-screen sync failed:", err);
    }
  };

  // Coalesce bursts (dragging fires many updates) into one message per ~30 ms.
  const schedule = () => {
    if (timer === undefined) timer = window.setTimeout(publish, 30);
  };

  const unsubscribe = useSlideStore.subscribe((s, p) => {
    if (
      s.slides !== p.slides ||
      s.slideId !== p.slideId ||
      s.savedSlides !== p.savedSlides ||
      s.savedSlideId !== p.savedSlideId ||
      s.previewMode !== p.previewMode
    ) {
      schedule();
    }
  });

  channel.onmessage = (ev: MessageEvent<SyncMessage>) => {
    if (ev.data?.type === "hello") {
      sent.clear(); // a (new/refreshed) second screen has nothing yet: send everything again
      publish();
    }
  };

  publish(); // announce immediately so an already-open second screen catches up

  return () => {
    unsubscribe();
    if (timer !== undefined) window.clearTimeout(timer);
    channel.onmessage = null;
    channel.close();
  };
}
