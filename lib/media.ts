import {
  IMAGE_TYPES, VIDEO_TYPES, MAX_IMAGE_MB, MAX_VIDEO_MB, MediaKind, uid,
} from "./types";
import { useSlideStore } from "@/store/slideStore";
import { urlFor } from "./mediaUrls";

export function classify(file: File): MediaKind | null {
  if (IMAGE_TYPES.includes(file.type)) return "image";
  if (VIDEO_TYPES.includes(file.type)) return "video";
  return null;
}

export function validateFile(file: File): string | null {
  const kind = classify(file);
  if (!kind) return `"${file.name}": use JPG, PNG, WebP, GIF, MP4, WebM or OGG.`;
  const mb = file.size / 1024 / 1024;
  if (kind === "image" && mb > MAX_IMAGE_MB) return `"${file.name}": image must be under ${MAX_IMAGE_MB} MB.`;
  if (kind === "video" && mb > MAX_VIDEO_MB) return `"${file.name}": video must be under ${MAX_VIDEO_MB} MB.`;
  return null;
}

function measure(kind: MediaKind, url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const fallback = { w: 16, h: 9 };
    if (kind === "image") {
      const i = new Image();
      i.onload = () => resolve({ w: i.naturalWidth || 16, h: i.naturalHeight || 9 });
      i.onerror = () => resolve(fallback);
      i.src = url;
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve({ w: v.videoWidth || 16, h: v.videoHeight || 9 });
      v.onerror = () => resolve(fallback);
      v.src = url;
    }
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Add image/video files to the current slide as movable elements. `at` is a % position of the drop point. */
export async function addFiles(files: File[], at?: { x: number; y: number }) {
  const errors: string[] = [];
  let n = 0;
  for (const file of files) {
    const err = validateFile(file);
    if (err) {
      errors.push(err);
      continue;
    }
    const kind = classify(file)!;
    // Temporary URL only for measuring; the tracked (auto-cleaned) URL is created afterwards.
    const probe = URL.createObjectURL(file);
    const dim = await measure(kind, probe);
    URL.revokeObjectURL(probe);
    const ratio = (dim.h / dim.w) * (16 / 9); // element h% per w%
    let w = 40;
    let h = w * ratio;
    if (h > 70) {
      h = 70;
      w = h / ratio;
    }
    const cx = at ? at.x : 50 + n * 3;
    const cy = at ? at.y : 50 + n * 3;
    useSlideStore.getState().addElement({
      id: uid(), type: kind,
      x: clamp(cx - w / 2, 0, 100 - w), y: clamp(cy - h / 2, 0, 100 - h), w, h,
      file, url: urlFor(file),
    });
    n++;
  }
  if (errors.length) alert(errors.join("\n"));
}

/** Use an image or video file as the slide background. */
export function setBackgroundFile(file: File) {
  const err = validateFile(file);
  if (err) return alert(err);
  useSlideStore.getState().setBgMedia({
    kind: classify(file)!,
    file,
    url: urlFor(file),
  });
}
