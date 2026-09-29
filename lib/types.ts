export type ElType = "text" | "image" | "video";
export type MediaKind = "image" | "video";
export type BgType = "color" | "gradient" | "media";
export type Align = "left" | "center" | "right";

/** Position and size are percentages of the slide (x/w of width, y/h of height). */
export interface SlideElement {
  id: string;
  type: ElType;
  x: number;
  y: number;
  w: number;
  h: number;
  // text
  text?: string;
  fontSize?: number; // in cqw (% of slide width). pt = cqw * 7.2
  color?: string;
  bold?: boolean;
  align?: Align;
  // media
  file?: File;
  url?: string; // object URL (not persisted)
}

export interface BgMedia {
  kind: MediaKind;
  url: string;
  file: File;
}

export interface Slide {
  id: string;
  elements: SlideElement[]; // array order = z-order (last is on top)
  bgType: BgType;
  bgColor: string;
  gradientFrom: string;
  gradientTo: string;
  bgMedia?: BgMedia;
}

/** Which presentation the second screen shows. */
export type PreviewMode = "current" | "saved";

/** A whole presentation plus which slide is active in it. Used for both Current and Saved state. */
export interface PresentationState {
  slides: Slide[];
  activeSlideId: string | null;
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg"];
export const MAX_IMAGE_MB = 10;
export const MAX_VIDEO_MB = 50;
export const MAX_PPTX_MB = 100;
export const PT_PER_CQW = 7.2; // slide is 10in = 720pt wide

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
