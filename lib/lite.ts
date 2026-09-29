import type {
  BgType, ElType, MediaKind, PresentationState, Slide, SlideElement,
} from "./types";
import { uid } from "./types";
import { urlFor } from "./mediaUrls";

/**
 * "Lite" presentations are plain JSON: media Files are replaced by a `mediaId`.
 * They are what gets stored in IndexedDB and broadcast to the second screen; the (big) media
 * blobs travel separately and only once.
 */
export interface LiteElement extends Omit<SlideElement, "file" | "url"> {
  mediaId?: string;
}
export interface LiteSlide extends Omit<Slide, "elements" | "bgMedia"> {
  elements: LiteElement[];
  bgMedia?: { kind: MediaKind; mediaId: string };
}
export interface LitePresentation {
  slides: LiteSlide[];
  activeSlideId: string | null;
}

// ---------- stable media ids ----------
const ids = new WeakMap<File, string>();

export function idFor(file: File): string {
  let id = ids.get(file);
  if (!id) {
    id = uid() + uid();
    ids.set(file, id);
  }
  return id;
}
/** Make a loaded File keep the id it was stored / sent under. */
export const bindId = (file: File, id: string) => void ids.set(file, id);

// ---------- Slide -> Lite ----------
export function toLiteSlide(s: Slide, files: Map<string, File>): LiteSlide {
  const elements = s.elements.map((e): LiteElement => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { file, url, ...rest } = e;
    if (!file) return rest;
    const mediaId = idFor(file);
    files.set(mediaId, file);
    return { ...rest, mediaId };
  });
  let bgMedia: LiteSlide["bgMedia"];
  if (s.bgMedia) {
    const mediaId = idFor(s.bgMedia.file);
    files.set(mediaId, s.bgMedia.file);
    bgMedia = { kind: s.bgMedia.kind, mediaId };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { elements: _e, bgMedia: _b, ...base } = s;
  return { ...base, elements, bgMedia };
}

export const toLite = (p: PresentationState, files: Map<string, File>): LitePresentation => ({
  slides: p.slides.map((s) => toLiteSlide(s, files)),
  activeSlideId: p.activeSlideId,
});

// ---------- Lite -> Slide ----------
export type MediaResolver = (mediaId: string) => File | undefined;

export function fromLiteSlide(s: LiteSlide, resolve: MediaResolver): Slide {
  const elements: SlideElement[] = [];
  for (const e of s.elements) {
    const { mediaId, ...rest } = e;
    if (e.type === "text") {
      elements.push(rest);
      continue;
    }
    const file = mediaId ? resolve(mediaId) : undefined;
    // A media element whose file is missing is dropped instead of rendering broken.
    if (file) elements.push({ ...rest, file, url: urlFor(file) });
  }
  let bgMedia: Slide["bgMedia"];
  if (s.bgMedia) {
    const file = resolve(s.bgMedia.mediaId);
    if (file) bgMedia = { kind: s.bgMedia.kind, file, url: urlFor(file) };
  }
  const { bgMedia: _b, elements: _e, ...base } = s;
  void _b;
  void _e;
  return { ...base, elements, bgMedia };
}

export const fromLite = (p: LitePresentation, resolve: MediaResolver): PresentationState => ({
  slides: p.slides.map((s) => fromLiteSlide(s, resolve)),
  activeSlideId: p.activeSlideId,
});

/** Ids of every media file a lite presentation refers to. */
export function mediaIdsOf(p: LitePresentation, into = new Set<string>()): Set<string> {
  for (const s of p.slides) {
    if (s.bgMedia) into.add(s.bgMedia.mediaId);
    for (const e of s.elements) if (e.mediaId) into.add(e.mediaId);
  }
  return into;
}

// ---------- validation of untrusted data (IndexedDB / broadcast) ----------
const BG_TYPES: BgType[] = ["color", "gradient", "media"];
const EL_TYPES: ElType[] = ["text", "image", "video"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Returns a safe LitePresentation, or null when the data is unusable. Never throws. */
export function sanitizeLite(raw: unknown): LitePresentation | null {
  try {
    if (!isObj(raw) || !Array.isArray(raw.slides)) return null;
    const slides: LiteSlide[] = [];
    for (const rs of raw.slides) {
      if (!isObj(rs) || typeof rs.id !== "string" || !Array.isArray(rs.elements)) continue;
      const elements: LiteElement[] = [];
      for (const re of rs.elements) {
        if (!isObj(re) || typeof re.id !== "string") continue;
        if (!EL_TYPES.includes(re.type as ElType)) continue;
        if (!num(re.x) || !num(re.y) || !num(re.w) || !num(re.h)) continue;
        elements.push({
          id: re.id, type: re.type as ElType, x: re.x, y: re.y, w: re.w, h: re.h,
          text: typeof re.text === "string" ? re.text : undefined,
          fontSize: num(re.fontSize) ? re.fontSize : undefined,
          color: typeof re.color === "string" ? re.color : undefined,
          bold: typeof re.bold === "boolean" ? re.bold : undefined,
          align: re.align === "left" || re.align === "center" || re.align === "right" ? re.align : undefined,
          mediaId: typeof re.mediaId === "string" ? re.mediaId : undefined,
        });
      }
      const bm = rs.bgMedia;
      slides.push({
        id: rs.id,
        elements,
        bgType: BG_TYPES.includes(rs.bgType as BgType) ? (rs.bgType as BgType) : "color",
        bgColor: str(rs.bgColor, "#0f172a"),
        gradientFrom: str(rs.gradientFrom, "#4f46e5"),
        gradientTo: str(rs.gradientTo, "#0ea5e9"),
        bgMedia:
          isObj(bm) && (bm.kind === "image" || bm.kind === "video") && typeof bm.mediaId === "string"
            ? { kind: bm.kind, mediaId: bm.mediaId }
            : undefined,
      });
    }
    if (!slides.length) return null;
    const active = typeof raw.activeSlideId === "string" ? raw.activeSlideId : null;
    return {
      slides,
      activeSlideId: active && slides.some((s) => s.id === active) ? active : slides[0].id,
    };
  } catch {
    return null;
  }
}
