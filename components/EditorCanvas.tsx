"use client";

import {
  DragEvent,
  PointerEvent as RPointerEvent,
  useRef,
  useState,
} from "react";
import { selectCurrentSlide, useSlideStore } from "@/store/slideStore";
import type { SlideElement } from "@/lib/types";
import { addFiles } from "@/lib/media";
import {
  ElementView,
  SlideBackground,
  boxStyle,
  textStyle,
} from "./SlideParts";

type Handle = "move" | "nw" | "ne" | "sw" | "se";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const HANDLES: { id: Exclude<Handle, "move">; cls: string }[] = [
  { id: "nw", cls: "-left-1.5 -top-1.5 cursor-nwse-resize" },
  { id: "ne", cls: "-right-1.5 -top-1.5 cursor-nesw-resize" },
  { id: "sw", cls: "-left-1.5 -bottom-1.5 cursor-nesw-resize" },
  { id: "se", cls: "-right-1.5 -bottom-1.5 cursor-nwse-resize" },
];

/** The big, editable "Current preview". */
export default function EditorCanvas() {
  const slide = useSlideStore(selectCurrentSlide);
  const selectedId = useSlideStore((s) => s.selectedId);
  const editingId = useSlideStore((s) => s.editingId);
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  const startDrag = (e: RPointerEvent, el: SlideElement, mode: Handle) => {
    e.stopPropagation();
    const st = useSlideStore.getState();
    if (st.editingId === el.id && mode === "move") return; // let the textarea handle it
    st.select(el.id);
    if (st.editingId !== el.id) st.setEditing(null);

    const rect = ref.current!.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const o = { x: el.x, y: el.y, w: el.w, h: el.h };
    const isMedia = el.type !== "text";
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ((ev.clientX - sx) / rect.width) * 100;
      const dy = ((ev.clientY - sy) / rect.height) * 100;
      if (!moved) {
        if (Math.abs(dx) + Math.abs(dy) < 0.3) return;
        moved = true;
        useSlideStore.getState().checkpoint();
      }
      let n = { ...o };

      if (mode === "move") {
        n.x = clamp(o.x + dx, 0, Math.max(0, 100 - o.w));
        n.y = clamp(o.y + dy, 0, Math.max(0, 100 - o.h));
      } else if (isMedia) {
        // keep aspect ratio; opposite corner stays fixed
        const w = Math.max(
          3,
          mode === "se" || mode === "ne" ? o.w + dx : o.w - dx,
        );
        const h = (w * o.h) / o.w;
        n = {
          w,
          h,
          x: mode === "nw" || mode === "sw" ? o.x + o.w - w : o.x,
          y: mode === "nw" || mode === "ne" ? o.y + o.h - h : o.y,
        };
      } else {
        if (mode === "se" || mode === "ne") n.w = Math.max(3, o.w + dx);
        if (mode === "sw" || mode === "nw") {
          n.w = Math.max(3, o.w - dx);
          n.x = o.x + o.w - n.w;
        }
        if (mode === "se" || mode === "sw") n.h = Math.max(3, o.h + dy);
        if (mode === "ne" || mode === "nw") {
          n.h = Math.max(3, o.h - dy);
          n.y = o.y + o.h - n.h;
        }
      }
      useSlideStore.getState().updateElement(el.id, n);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const rect = ref.current!.getBoundingClientRect();
    const at = {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
    const files = Array.from(e.dataTransfer.files);
    if (files.length) return void addFiles(files, at);
    const text = e.dataTransfer.getData("text/plain");
    if (text.trim()) useSlideStore.getState().addText(text, at);
  };

  return (
    <div
      ref={ref}
      className="relative aspect-video w-full select-none rounded-lg shadow-xl ring-1 ring-slate-600"
      style={{ containerType: "inline-size" }}
      onPointerDown={() => {
        const st = useSlideStore.getState();
        st.select(null);
        st.setEditing(null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        <SlideBackground slide={slide} mode="edit" />
      </div>

      {slide.elements.map((el) => {
        const selected = el.id === selectedId;
        const editing = el.id === editingId;
        return (
          <div
            key={el.id}
            className="absolute cursor-move  hover:outline-1 hover:outline-dashed hover:outline-white/60"
            style={{
              ...boxStyle(el),
              outline: selected ? "2px solid #818cf8" : undefined,
            }}
            onPointerDown={(e) => startDrag(e, el, "move")}
            onDoubleClick={() => {
              if (el.type !== "text") return;
              const st = useSlideStore.getState();
              st.checkpoint();
              st.setEditing(el.id);
            }}
          >
            {editing ? (
              <textarea
                autoFocus
                spellCheck={false}
                value={el.text ?? ""}
                onFocus={(e) => {
                  if (el.text === "Double-click to edit")
                    e.currentTarget.select();
                }}
                onChange={(e) =>
                  useSlideStore
                    .getState()
                    .updateElement(el.id, { text: e.target.value })
                }
                onBlur={() => {
                  const st = useSlideStore.getState();
                  st.setEditing(null);
                  if (!(el.text ?? "").trim()) st.removeElement(el.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.currentTarget.blur();
                }}
                className="resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
                style={{ ...textStyle(el), cursor: "text" }}
              />
            ) : (
              <div className="pointer-events-none h-full w-full">
                <ElementView el={el} mode="edit" />
              </div>
            )}

            {selected &&
              !editing &&
              HANDLES.map((h) => (
                <div
                  key={h.id}
                  className={`absolute h-3 w-3 rounded-sm border border-indigo-500 bg-white ${h.cls}`}
                  onPointerDown={(e) => startDrag(e, el, h.id)}
                />
              ))}
          </div>
        );
      })}

      {over && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-500/20 text-lg font-semibold text-white">
          Drop image, video or text here
        </div>
      )}
    </div>
  );
}
