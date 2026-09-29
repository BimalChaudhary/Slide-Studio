"use client";

import { DragEvent, useState } from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useSlideStore } from "@/store/slideStore";
import SlideCanvas from "./SlideCanvas";

export default function SavedSlideList() {
  const savedSlides = useSlideStore((s) => s.savedSlides);
  const savedSlideId = useSlideStore((s) => s.savedSlideId);
  const previewMode = useSlideStore((s) => s.previewMode);
  const st = useSlideStore.getState;
  const [dragId, setDragId] = useState<string | null>(null);

  const onDragOver = (e: DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    const index = savedSlides.findIndex((s) => s.id === overId);
    st().reorderSavedSlideTo(dragId, index);
  };

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <h3 className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Saved
      </h3>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {savedSlides.map((s, i) => {
          const active = previewMode === "saved" && s.id === savedSlideId;
          return (
            <div
              key={s.id}
              draggable
              onDragStart={() => setDragId(s.id)}
              onDragOver={(e) => onDragOver(e, s.id)}
              onDragEnd={() => setDragId(null)}
              className={`rounded-lg border p-1.5 transition ${
                active ? "border-indigo-400 bg-slate-800" : "border-slate-700"
              } ${dragId === s.id ? "opacity-40" : ""}`}
            >
              <button
                className="block w-full text-left"
                onClick={() => st().selectSavedSlide(s.id)}
              >
                <SlideCanvas slide={s} />
                <span className="mt-1 flex items-center gap-1 text-xs text-slate-300">
                  <GripVertical
                    size={12}
                    className="cursor-grab text-slate-500"
                  />
                  Slide {i + 1}
                </span>
              </button>
              <div className="mt-1 flex justify-end gap-1">
                <button
                  className="btn btn-ghost !p-1"
                  onClick={() => st().editSavedSlide(s.id)}
                  disabled={savedSlides.length === 1}
                  title="Edit (moves this slide to your draft)"
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="btn btn-ghost !p-1"
                  onClick={() => st().deleteSavedSlide(s.id)}
                  disabled={savedSlides.length === 1}
                  title="Delete saved slide"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {savedSlides.length === 0 && (
          <p className="text-xs text-slate-500">Nothing saved yet.</p>
        )}
      </div>
    </aside>
  );
}
