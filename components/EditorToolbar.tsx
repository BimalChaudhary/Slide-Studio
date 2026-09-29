"use client";

import { ChangeEvent } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, BringToFront, Copy, ImagePlus,
  Redo2, SendToBack, Trash2, Type, Undo2, Wallpaper,
} from "lucide-react";
import { selectCurrentSlide, useSlideStore } from "@/store/slideStore";
import { addFiles } from "@/lib/media";
import { IMAGE_TYPES, PT_PER_CQW, VIDEO_TYPES } from "@/lib/types";

const cls = (active: boolean) => `btn !px-2.5 !py-1.5 ${active ? "btn-primary" : "btn-ghost"}`;

export default function EditorToolbar() {
  const slide = useSlideStore(selectCurrentSlide);
  const selectedId = useSlideStore((s) => s.selectedId);
  const canUndo = useSlideStore((s) => s.past.length > 0);
  const canRedo = useSlideStore((s) => s.future.length > 0);
  const st = useSlideStore.getState;

  const el = slide.elements.find((e) => e.id === selectedId);

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) void addFiles(files);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 p-2">
      <button className={cls(false)} onClick={() => st().addText()} title="Add text box">
        <Type size={16} /> Text
      </button>
      <label className={`${cls(false)} cursor-pointer`} title="Add image or video">
        <ImagePlus size={16} /> Image / Video
        <input
          type="file"
          hidden
          multiple
          accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
          onChange={onFiles}
        />
      </label>

      <span className="mx-1 h-6 w-px bg-slate-600" />

      <button className={cls(false)} onClick={() => st().undo()} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <Undo2 size={16} />
      </button>
      <button className={cls(false)} onClick={() => st().redo()} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        <Redo2 size={16} />
      </button>

      {el && (
        <>
          <span className="mx-1 h-6 w-px bg-slate-600" />

          {el.type === "text" && (
            <>
              <label className="flex items-center gap-1 text-xs text-slate-300">
                Size
                <input
                  type="number"
                  min={4}
                  max={200}
                  className="input !w-16 !px-2 !py-1"
                  value={Math.round((el.fontSize ?? 2.6) * PT_PER_CQW)}
                  onChange={(e) => {
                    const pt = Number(e.target.value);
                    if (pt > 0) st().patchElement(el.id, { fontSize: pt / PT_PER_CQW }, "font");
                  }}
                />
                pt
              </label>
              <input
                type="color"
                title="Text color"
                value={el.color ?? "#ffffff"}
                onChange={(e) => st().patchElement(el.id, { color: e.target.value }, "color")}
                className="h-8 w-9 cursor-pointer rounded border border-slate-600 bg-transparent"
              />
              <button
                className={cls(!!el.bold)}
                onClick={() => st().patchElement(el.id, { bold: !el.bold })}
                title="Bold"
              >
                <Bold size={16} />
              </button>
              {(["left", "center", "right"] as const).map((a) => {
                const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                return (
                  <button
                    key={a}
                    className={cls((el.align ?? "left") === a)}
                    onClick={() => st().patchElement(el.id, { align: a })}
                    title={`Align ${a}`}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </>
          )}

          {el.type !== "text" && (
            <button className={cls(false)} onClick={() => st().useAsBackground(el.id)} title="Use as slide background">
              <Wallpaper size={16} /> Set as background
            </button>
          )}

          <button className={cls(false)} onClick={() => st().reorder(el.id, "front")} title="Bring to front">
            <BringToFront size={16} />
          </button>
          <button className={cls(false)} onClick={() => st().reorder(el.id, "back")} title="Send to back">
            <SendToBack size={16} />
          </button>
          <button className={cls(false)} onClick={() => st().duplicate(el.id)} title="Duplicate (Ctrl+D)">
            <Copy size={16} />
          </button>
          <button className={cls(false)} onClick={() => st().removeElement(el.id)} title="Delete (Del)">
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );
}
