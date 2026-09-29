"use client";

import { ChangeEvent } from "react";
import { Upload, X } from "lucide-react";
import { selectCurrentSlide, useSlideStore } from "@/store/slideStore";
import { setBackgroundFile } from "@/lib/media";
import { BgType, IMAGE_TYPES, VIDEO_TYPES } from "@/lib/types";

const BG: { id: BgType; label: string }[] = [
  { id: "color", label: "Color" },
  { id: "gradient", label: "Gradient" },
  { id: "media", label: "Image/Video" },
];

export default function BackgroundControls() {
  const slide = useSlideStore(selectCurrentSlide);
  const st = useSlideStore.getState;

  const onBg = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setBackgroundFile(file);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-l border-slate-700 pl-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Background
      </span>

      <div className="inline-flex gap-1">
        {BG.map((b) => (
          <button
            key={b.id}
            onClick={() => st().patchSlide({ bgType: b.id })}
            className={`btn !px-2 !py-1 text-xs ${slide.bgType === b.id ? "btn-primary" : "btn-ghost"}`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {slide.bgType === "color" && (
        <input
          type="color"
          title="Background color"
          value={slide.bgColor}
          onChange={(e) => st().patchSlide({ bgColor: e.target.value }, "bg")}
          className="h-8 w-9 cursor-pointer rounded border border-slate-600 bg-transparent"
        />
      )}

      {slide.bgType === "gradient" && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-400">From</span>
          <input
            type="color"
            value={slide.gradientFrom}
            onChange={(e) =>
              st().patchSlide({ gradientFrom: e.target.value }, "g1")
            }
            className="h-8 w-9 cursor-pointer rounded border border-slate-600 bg-transparent"
          />
          <span className="text-xs text-slate-400">To</span>
          <input
            type="color"
            value={slide.gradientTo}
            onChange={(e) =>
              st().patchSlide({ gradientTo: e.target.value }, "g2")
            }
            className="h-8 w-9 cursor-pointer rounded border border-slate-600 bg-transparent"
          />
        </div>
      )}

      {slide.bgType === "media" && (
        <div className="flex items-center gap-1">
          {slide.bgMedia && (
            <span className="flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs">
              {slide.bgMedia.kind === "video" ? "🎬" : "🖼️"}
              <span className="max-w-[100px] truncate">
                {slide.bgMedia.file.name}
              </span>
              <button onClick={() => st().setBgMedia(undefined)} title="Remove">
                <X size={12} />
              </button>
            </span>
          )}
          <label className="btn btn-ghost cursor-pointer !px-2 !py-1 text-xs">
            <Upload size={14} /> {slide.bgMedia ? "Replace" : "Upload"}
            <input
              type="file"
              hidden
              accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
              onChange={onBg}
            />
          </label>
        </div>
      )}
    </div>
  );
}
