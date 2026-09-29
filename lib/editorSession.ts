"use client";

import { useEffect, useState } from "react";
import { useSlideStore } from "@/store/slideStore";
import { loadPersisted, setPersistenceEnabled } from "./db";
import { pruneUrls } from "./mediaUrls";
import { readPreviewMode, startEditorSync, writePreviewMode } from "./sync";

export type EditorRole = "pending" | "primary" | "secondary";

const LOCK_NAME = "slide-studio-editor";
const DRAFT_DELAY_MS = 1500;
const CLEANUP_DELAY_MS = 3000;

/** Load the last session's saved + draft presentations (safe: never throws). */
async function hydrateFromDisk() {
  try {
    const { saved, draft } = await loadPersisted();
    useSlideStore.getState().hydrate(saved, draft, readPreviewMode());
  } catch (err) {
    console.warn("Could not restore the previous session:", err);
    useSlideStore.getState().setPreviewMode(readPreviewMode());
  }
}

/** Revoke object URLs of files nothing refers to any more (removed / replaced media). */
function startMediaCleanup(): () => void {
  let timer: number | undefined;
  const run = () => {
    timer = undefined;
    const st = useSlideStore.getState();
    const keep = new Set<File>();
    const add = (slides: typeof st.slides) => {
      for (const s of slides) {
        if (s.bgMedia) keep.add(s.bgMedia.file);
        for (const e of s.elements) if (e.file) keep.add(e.file);
      }
    };
    add(st.slides);
    add(st.savedSlides);
    st.past.forEach(add);
    st.future.forEach(add);
    if (st.clipboard?.file) keep.add(st.clipboard.file);
    pruneUrls(keep);
  };
  const unsubscribe = useSlideStore.subscribe((s, p) => {
    if (s.slides !== p.slides || s.savedSlides !== p.savedSlides || s.past !== p.past) {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(run, CLEANUP_DELAY_MS);
    }
  });
  return () => {
    unsubscribe();
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

/** Keep the draft (Current State) on disk so a refresh does not lose unsaved work. */
function startDraftPersistence(): () => void {
  let timer: number | undefined;
  const flush = () => {
    timer = undefined;
    useSlideStore.getState().persistNow().catch((err) => console.warn("Draft not stored:", err));
  };
  const unsubscribe = useSlideStore.subscribe((s, p) => {
    if (
      s.slides !== p.slides ||
      s.slideId !== p.slideId ||
      s.savedSlides !== p.savedSlides ||
      s.savedSlideId !== p.savedSlideId
    ) {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(flush, DRAFT_DELAY_MS);
    }
  });
  const onHide = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      flush();
    }
  };
  window.addEventListener("pagehide", onHide);
  return () => {
    unsubscribe();
    window.removeEventListener("pagehide", onHide);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

function startModePersistence(): () => void {
  return useSlideStore.subscribe((s, p) => {
    if (s.previewMode !== p.previewMode) writePreviewMode(s.previewMode);
  });
}

/**
 * Editor lifecycle. Exactly one editor tab is "primary": it owns saving and drives the second
 * screen. A second editor tab is "secondary" (read-only regarding storage/sync) so two editors can
 * never fight over the same data. Uses a Web Lock; without the API every tab is primary.
 */
export function useEditorSession(): EditorRole {
  const [role, setRole] = useState<EditorRole>("pending");

  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    const stops: Array<() => void> = [];

    const becomePrimary = async () => {
      await hydrateFromDisk();
      if (cancelled) return;
      setPersistenceEnabled(true);
      stops.push(startEditorSync(), startDraftPersistence(), startMediaCleanup(), startModePersistence());
      setRole("primary");
    };

    const becomeSecondary = async () => {
      await hydrateFromDisk();
      if (!cancelled) setRole("secondary");
    };

    if (typeof navigator !== "undefined" && navigator.locks) {
      navigator.locks
        .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
          if (cancelled) return undefined;
          if (!lock) {
            void becomeSecondary();
            return undefined;
          }
          // Hold the lock until this effect is cleaned up (or the tab closes).
          return new Promise<void>((resolve) => {
            release = resolve;
            void becomePrimary();
          });
        })
        .catch(() => {
          if (!cancelled) void becomePrimary();
        });
    } else {
      void becomePrimary();
    }

    return () => {
      cancelled = true;
      stops.splice(0).forEach((stop) => stop());
      setPersistenceEnabled(false);
      release?.();
    };
  }, []);

  return role;
}
