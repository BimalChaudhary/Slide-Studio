import { create } from "zustand";
import {
  BgMedia,
  PreviewMode,
  PresentationState,
  Slide,
  SlideElement,
  uid,
} from "@/lib/types";
import { cloneSlides, validSlideId } from "@/lib/clone";
import { persistAll, type DraftRecord } from "@/lib/db";

export const DEFAULT_TEXT = "Double-click to edit";

export const createSlide = (): Slide => ({
  id: uid(),
  elements: [
    {
      id: uid(),
      type: "text",
      x: 8,
      y: 10,
      w: 84,
      h: 16,
      text: "Slide title",
      fontSize: 5,
      color: "#ffffff",
      bold: true,
      align: "left",
    },
    {
      id: uid(),
      type: "text",
      x: 8,
      y: 30,
      w: 84,
      h: 50,
      text: "Double-click to edit this text.\nDrag to move, drop images or videos here.",
      fontSize: 2.6,
      color: "#ffffff",
      bold: false,
      align: "left",
    },
  ],
  bgType: "gradient",
  bgColor: "#0f172a",
  gradientFrom: "#4f46e5",
  gradientTo: "#0ea5e9",
});

interface Store {
  slides: Slide[];
  slideId: string;
  savedSlides: Slide[];
  savedSlideId: string;
  savedSource: Slide[] | null;
  lastSavedAt: number | null;
  saveError: string | null;
  previewMode: PreviewMode;

  selectedId: string | null;
  editingId: string | null;
  clipboard: SlideElement | null;
  past: Slide[][];
  future: Slide[][];

  save: () => Promise<boolean>;
  saveSlide: (id: string) => Promise<boolean>;
  persistNow: () => Promise<void>;
  setPreviewMode: (m: PreviewMode) => void;
  importSlides: (incoming: Slide[], mode: "append" | "replace") => void;
  hydrate: (
    saved: PresentationState | null,
    draft: DraftRecord | null,
    mode: PreviewMode,
  ) => void;

  checkpoint: (key?: string) => void;
  undo: () => void;
  redo: () => void;

  selectSlide: (id: string) => void;
  addSlide: () => void;
  removeSlide: (id: string) => void;
  moveSlide: (id: string, dir: -1 | 1) => void;
  reorderSlideTo: (id: string, index: number) => void;
  patchSlide: (patch: Partial<Slide>, key?: string) => void;
  setBgMedia: (m?: BgMedia) => void;

  // ---- Saved-list navigation & management ----
  selectSavedSlide: (id: string) => void;
  moveSavedSlide: (id: string, dir: -1 | 1) => void;
  reorderSavedSlideTo: (id: string, index: number) => void;
  deleteSavedSlide: (id: string) => void;
  /** Cut: removes the slide from Saved and drops it into the Current draft, selected. */
  editSavedSlide: (id: string) => void;

  select: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  addElement: (el: SlideElement) => void;
  addText: (text?: string, at?: { x: number; y: number }) => void;
  updateElement: (id: string, patch: Partial<SlideElement>) => void;
  patchElement: (
    id: string,
    patch: Partial<SlideElement>,
    key?: string,
  ) => void;
  removeElement: (id?: string) => void;
  duplicate: (id?: string) => void;
  reorder: (id: string, to: "front" | "back") => void;
  nudge: (dx: number, dy: number) => void;
  copy: () => void;
  paste: () => void;
  useAsBackground: (id: string) => void;
}

let lastKey = "";
let lastTime = 0;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const first = createSlide();
const initialSlides = [first];

export const useSlideStore = create<Store>((set, get) => {
  const mapCur = (fn: (s: Slide) => Slide) =>
    set((st) => ({
      slides: st.slides.map((s) => (s.id === st.slideId ? fn(s) : s)),
    }));
  const cur = () => {
    const st = get();
    return st.slides.find((s) => s.id === st.slideId) ?? st.slides[0];
  };

  return {
    slides: initialSlides,
    slideId: first.id,
    savedSlides: cloneSlides(initialSlides),
    savedSlideId: first.id,
    savedSource: initialSlides,
    lastSavedAt: null,
    saveError: null,
    previewMode: "current",
    selectedId: null,
    editingId: null,
    clipboard: null,
    past: [],
    future: [],

    persistNow: async () => {
      const st = get();
      await persistAll(
        { slides: st.savedSlides, activeSlideId: st.savedSlideId },
        {
          state: {
            slides: st.slides,
            activeSlideId: validSlideId(st.slides, st.slideId),
          },
          dirty: st.slides !== st.savedSource,
        },
      );
    },

    save: async () => {
      const st = get();
      if (!st.slides.length) return false;
      set({
        savedSlides: cloneSlides(st.slides),
        savedSlideId: validSlideId(st.slides, st.slideId) ?? st.slides[0].id,
        savedSource: st.slides,
        lastSavedAt: Date.now(),
        saveError: null,
      });
      try {
        await get().persistNow();
        return true;
      } catch (err) {
        console.error("Could not persist the saved presentation:", err);
        set({
          saveError:
            err instanceof Error
              ? err.message
              : "Could not store the presentation.",
        });
        return false;
      }
    },

    /** Save just one draft slide into the Saved list (replaces it if it's already there by id). */
    saveSlide: async (id) => {
      const st = get();
      const slide = st.slides.find((s) => s.id === id);
      if (!slide) return false;

      const clone = cloneSlides([slide])[0];
      const idx = st.savedSlides.findIndex((s) => s.id === id);
      const savedSlides =
        idx >= 0
          ? st.savedSlides.map((s, i) => (i === idx ? clone : s))
          : [...st.savedSlides, clone];

      set({
        savedSlides,
        savedSlideId: clone.id,
        lastSavedAt: Date.now(),
        saveError: null,
      });
      try {
        await get().persistNow();
        return true;
      } catch (err) {
        console.error("Could not persist the saved slide:", err);
        set({
          saveError:
            err instanceof Error ? err.message : "Could not store the slide.",
        });
        return false;
      }
    },

    setPreviewMode: (m) => set({ previewMode: m }),

    importSlides: (incoming, mode) => {
      if (!incoming.length) return;
      // Imports land in the Saved list, not the draft (per current requirement).
      set((st) => {
        const savedSlides =
          mode === "replace" ? incoming : [...st.savedSlides, ...incoming];
        return {
          savedSlides,
          savedSlideId: incoming[0].id,
          previewMode: "saved",
        };
      });
      void get().persistNow();
    },

    hydrate: (saved, draft, mode) => {
      const st = get();
      if (st.slides !== initialSlides || st.past.length) return;
      if (!saved && !draft) return set({ previewMode: mode });

      const current = draft?.state ?? saved;
      if (!current || !current.slides.length) return;
      const slides = current.slides;
      const slideId =
        validSlideId(slides, current.activeSlideId) ?? slides[0].id;

      const savedState = saved && saved.slides.length ? saved : null;
      set({
        slides,
        slideId,
        savedSlides: savedState
          ? cloneSlides(savedState.slides)
          : st.savedSlides,
        savedSlideId: savedState
          ? (validSlideId(savedState.slides, savedState.activeSlideId) ??
            savedState.slides[0].id)
          : st.savedSlideId,
        savedSource:
          savedState && draft && !draft.dirty
            ? slides
            : savedState && !draft
              ? slides
              : null,
        previewMode: mode,
        selectedId: null,
        editingId: null,
        past: [],
        future: [],
      });
    },

    checkpoint: (key) => {
      const now = Date.now();
      if (key && key === lastKey && now - lastTime < 800) {
        lastTime = now;
        return;
      }
      lastKey = key ?? "";
      lastTime = now;
      set((st) => ({ past: [...st.past.slice(-99), st.slides], future: [] }));
    },

    undo: () => {
      const st = get();
      if (!st.past.length) return;
      const prev = st.past[st.past.length - 1];
      lastKey = "";
      set({
        slides: prev,
        past: st.past.slice(0, -1),
        future: [st.slides, ...st.future],
        slideId: prev.some((s) => s.id === st.slideId)
          ? st.slideId
          : prev[0].id,
        selectedId: null,
        editingId: null,
      });
    },

    redo: () => {
      const st = get();
      if (!st.future.length) return;
      const next = st.future[0];
      lastKey = "";
      set({
        slides: next,
        future: st.future.slice(1),
        past: [...st.past, st.slides],
        slideId: next.some((s) => s.id === st.slideId)
          ? st.slideId
          : next[0].id,
        selectedId: null,
        editingId: null,
      });
    },

    selectSlide: (id) =>
      set({ slideId: id, selectedId: null, editingId: null }),

    addSlide: () => {
      get().checkpoint();
      const s = createSlide();
      set((st) => ({
        slides: [...st.slides, s],
        slideId: s.id,
        selectedId: null,
        editingId: null,
      }));
    },

    removeSlide: (id) => {
      const st = get();
      if (st.slides.length === 1) return;
      st.checkpoint();
      const idx = st.slides.findIndex((s) => s.id === id);
      const slides = st.slides.filter((s) => s.id !== id);
      set({
        slides,
        slideId:
          st.slideId === id ? slides[Math.max(0, idx - 1)].id : st.slideId,
        selectedId: null,
        editingId: null,
      });
    },

    moveSlide: (id, dir) => {
      const st = get();
      const i = st.slides.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= st.slides.length) return;
      st.checkpoint();
      const slides = [...st.slides];
      [slides[i], slides[j]] = [slides[j], slides[i]];
      set({ slides });
    },

    reorderSlideTo: (id, index) => {
      const st = get();
      const from = st.slides.findIndex((s) => s.id === id);
      if (from < 0) return;
      const to = clamp(index, 0, st.slides.length - 1);
      if (from === to) return;
      st.checkpoint("drag-draft");
      const slides = [...st.slides];
      const [item] = slides.splice(from, 1);
      slides.splice(to, 0, item);
      set({ slides });
    },

    patchSlide: (patch, key) => {
      get().checkpoint(key);
      mapCur((s) => ({ ...s, ...patch }));
    },

    setBgMedia: (m) => {
      get().checkpoint();
      mapCur((s) => ({
        ...s,
        bgMedia: m,
        bgType: m ? "media" : s.bgType === "media" ? "color" : s.bgType,
      }));
    },

    // ---- Saved list ----

    selectSavedSlide: (id) => set({ savedSlideId: id, previewMode: "saved" }),

    moveSavedSlide: (id, dir) => {
      const st = get();
      const i = st.savedSlides.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= st.savedSlides.length) return;
      const savedSlides = [...st.savedSlides];
      [savedSlides[i], savedSlides[j]] = [savedSlides[j], savedSlides[i]];
      set({ savedSlides });
      void get().persistNow();
    },

    reorderSavedSlideTo: (id, index) => {
      const st = get();
      const from = st.savedSlides.findIndex((s) => s.id === id);
      if (from < 0) return;
      const to = clamp(index, 0, st.savedSlides.length - 1);
      if (from === to) return;
      const savedSlides = [...st.savedSlides];
      const [item] = savedSlides.splice(from, 1);
      savedSlides.splice(to, 0, item);
      set({ savedSlides });
      void get().persistNow();
    },

    deleteSavedSlide: (id) => {
      const st = get();
      if (st.savedSlides.length <= 1) return; // keep at least one saved slide
      const idx = st.savedSlides.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const savedSlides = st.savedSlides.filter((s) => s.id !== id);
      set({
        savedSlides,
        savedSlideId:
          st.savedSlideId === id
            ? savedSlides[Math.max(0, idx - 1)].id
            : st.savedSlideId,
      });
      void get().persistNow();
    },

    editSavedSlide: (id) => {
      const st = get();
      if (st.savedSlides.length <= 1) return; // keep at least one saved slide
      const idx = st.savedSlides.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const slide = st.savedSlides[idx];
      const savedSlides = st.savedSlides.filter((s) => s.id !== id);
      const nextSavedId =
        st.savedSlideId === id
          ? savedSlides[Math.max(0, idx - 1)].id
          : st.savedSlideId;

      st.checkpoint();
      set({
        savedSlides,
        savedSlideId: nextSavedId,
        slides: [...st.slides, slide],
        slideId: slide.id,
        previewMode: "current",
        selectedId: null,
        editingId: null,
      });
      void get().persistNow();
    },

    select: (id) => set({ selectedId: id }),
    setEditing: (id) => set({ editingId: id }),

    addElement: (el) => {
      get().checkpoint();
      mapCur((s) => ({ ...s, elements: [...s.elements, el] }));
      set({ selectedId: el.id, editingId: null });
    },

    addText: (text, at) => {
      const isNew = text === undefined;
      const t = text ?? DEFAULT_TEXT;
      const w = isNew ? 40 : 60;
      const lines = t.split("\n").length + Math.floor(t.length / 60);
      const h = isNew ? 12 : clamp(lines * 6 + 2, 10, 80);
      const cx = at ? at.x : 50;
      const cy = at ? at.y : 50;
      const el: SlideElement = {
        id: uid(),
        type: "text",
        x: clamp(cx - w / 2, 0, 100 - w),
        y: clamp(cy - h / 2, 0, 100 - h),
        w,
        h,
        text: t,
        fontSize: 3,
        color: "#ffffff",
        bold: false,
        align: "left",
      };
      get().addElement(el);
      if (isNew) set({ editingId: el.id });
    },

    updateElement: (id, patch) =>
      mapCur((s) => ({
        ...s,
        elements: s.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      })),

    patchElement: (id, patch, key) => {
      get().checkpoint(key);
      get().updateElement(id, patch);
    },

    removeElement: (id) => {
      const target = id ?? get().selectedId;
      if (!target) return;
      get().checkpoint();
      mapCur((s) => ({
        ...s,
        elements: s.elements.filter((e) => e.id !== target),
      }));
      set({ selectedId: null, editingId: null });
    },

    duplicate: (id) => {
      const el = cur().elements.find((e) => e.id === (id ?? get().selectedId));
      if (!el) return;
      get().addElement({
        ...el,
        id: uid(),
        x: clamp(el.x + 3, 0, 100 - el.w),
        y: clamp(el.y + 3, 0, 100 - el.h),
      });
    },

    reorder: (id, to) => {
      get().checkpoint();
      mapCur((s) => {
        const el = s.elements.find((e) => e.id === id);
        if (!el) return s;
        const rest = s.elements.filter((e) => e.id !== id);
        return {
          ...s,
          elements: to === "front" ? [...rest, el] : [el, ...rest],
        };
      });
    },

    nudge: (dx, dy) => {
      const el = cur().elements.find((e) => e.id === get().selectedId);
      if (!el) return;
      get().checkpoint("nudge");
      get().updateElement(el.id, {
        x: clamp(el.x + dx, 0, 100 - el.w),
        y: clamp(el.y + dy, 0, 100 - el.h),
      });
    },

    copy: () => {
      const el = cur().elements.find((e) => e.id === get().selectedId);
      if (el) set({ clipboard: el });
    },

    paste: () => {
      const c = get().clipboard;
      if (!c) return;
      const el: SlideElement = {
        ...c,
        id: uid(),
        x: clamp(c.x + 3, 0, 100 - c.w),
        y: clamp(c.y + 3, 0, 100 - c.h),
      };
      get().addElement(el);
      set({ clipboard: el });
    },

    useAsBackground: (id) => {
      const el = cur().elements.find((e) => e.id === id);
      if (!el || !el.file || !el.url || el.type === "text") return;
      get().checkpoint();
      mapCur((s) => ({
        ...s,
        bgType: "media",
        bgMedia: {
          kind: el.type as "image" | "video",
          file: el.file!,
          url: el.url!,
        },
        elements: s.elements.filter((e) => e.id !== id),
      }));
      set({ selectedId: null });
    },
  };
});

export const selectCurrentSlide = (st: Store) =>
  st.slides.find((s) => s.id === st.slideId) ?? st.slides[0];

export const selectCurrentSavedSlide = (st: Store) =>
  st.savedSlides.find((s) => s.id === st.savedSlideId) ?? st.savedSlides[0];

export const selectIsDirty = (st: Store) => st.slides !== st.savedSource;
