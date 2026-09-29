"use client";

import { DragEvent, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useSlideStore } from "@/store/slideStore";
import SlideCanvas from "./SlideCanvas";

export default function SlideList() {
  const slides = useSlideStore((s) => s.slides);
  const slideId = useSlideStore((s) => s.slideId);
  const st = useSlideStore.getState;
  const [dragId, setDragId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const onDragOver = (e: DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    const index = slides.findIndex((s) => s.id === overId);
    st().reorderSlideTo(dragId, index);
  };

  const saveOne = async (id: string) => {
    setSavingId(id);
    await st().saveSlide(id);
    setSavingId(null);
  };

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <h3 className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Slides
      </h3>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {slides.map((s, i) => (
          <div
            key={s.id}
            draggable
            onDragStart={() => setDragId(s.id)}
            onDragOver={(e) => onDragOver(e, s.id)}
            onDragEnd={() => setDragId(null)}
            className={`rounded-lg border p-1.5 transition ${
              s.id === slideId
                ? "border-indigo-400 bg-slate-800"
                : "border-slate-700"
            } ${dragId === s.id ? "opacity-40" : ""}`}
          >
            <button
              className="block w-full text-left"
              onClick={() => st().selectSlide(s.id)}
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
                onClick={() => saveOne(s.id)}
                disabled={savingId === s.id}
                title="Save this slide"
              >
                <Save
                  size={14}
                  className={savingId === s.id ? "animate-pulse" : ""}
                />
              </button>
              <button
                className="btn btn-ghost !p-1"
                onClick={() => st().moveSlide(s.id, -1)}
                title="Move up"
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="btn btn-ghost !p-1"
                onClick={() => st().moveSlide(s.id, 1)}
                title="Move down"
              >
                <ArrowDown size={14} />
              </button>
              <button
                className="btn btn-ghost !p-1"
                onClick={() => st().removeSlide(s.id)}
                disabled={slides.length === 1}
                title="Delete slide"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn btn-ghost mt-2 w-full shrink-0 justify-center"
        onClick={() => st().addSlide()}
      >
        <Plus size={16} /> Add slide
      </button>
    </aside>
  );
}
