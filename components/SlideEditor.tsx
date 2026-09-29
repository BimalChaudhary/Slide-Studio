"use client";

import { useEffect } from "react";
import { useSlideStore } from "@/store/slideStore";
import { addFiles } from "@/lib/media";
import { useEditorSession } from "@/lib/editorSession";
import ProjectBar from "./ProjectBar";
import SlideList from "./SlideList";
import SavedSlideList from "./SavedSlideList";
import EditorToolbar from "./EditorToolbar";
import EditorCanvas from "./EditorCanvas";
import SlideSettings from "./SlideSettings";

const MARK = "__slide_studio_element__";

const isTyping = (t: EventTarget | null) => {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT")
    return true;
  if (t.tagName === "INPUT") {
    return !["color", "range", "checkbox", "radio", "file", "button"].includes(
      (t as HTMLInputElement).type,
    );
  }
  return false;
};

/** Global shortcuts, paste, copy and file-drop protection. */
function useEditorShortcuts() {
  useEffect(() => {
    const st = useSlideStore.getState;

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (mod && k === "s") {
        e.preventDefault();
        void st().save();
      } else if (mod && k === "z") {
        e.preventDefault();
        e.shiftKey ? st().redo() : st().undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        st().redo();
      } else if (mod && k === "d") {
        e.preventDefault();
        st().duplicate();
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        if (st().selectedId) {
          e.preventDefault();
          st().removeElement();
        }
      } else if (!mod && e.key.startsWith("Arrow") && st().selectedId) {
        e.preventDefault();
        const step = e.shiftKey ? 3 : 0.5;
        st().nudge(
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
        );
      } else if (e.key === "Escape") {
        st().select(null);
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(e.target) || !st().selectedId) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", MARK);
      st().copy();
    };

    const onCut = (e: ClipboardEvent) => {
      if (isTyping(e.target) || !st().selectedId) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", MARK);
      st().copy();
      st().removeElement();
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const text = dt.getData("text/plain");
      if (text === MARK) {
        e.preventDefault();
        st().paste();
        return;
      }
      const files = Array.from(dt.files);
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
        return;
      }
      if (text.trim()) {
        e.preventDefault();
        st().addText(text);
      }
    };

    const stopDrop = (e: DragEvent) => e.preventDefault();

    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    window.addEventListener("dragover", stopDrop);
    window.addEventListener("drop", stopDrop);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", stopDrop);
      window.removeEventListener("drop", stopDrop);
    };
  }, []);
}

export default function SlideEditor() {
  useEditorShortcuts();
  const role = useEditorSession();

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-4">
      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[170px_minmax(0,1fr)_260px]">
        <SlideList />

        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          <ProjectBar />
          <EditorToolbar />
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Current preview (edit here)
            </h3>
            <EditorCanvas />
            <p className="mt-2 text-xs text-slate-500">
              Drag to move · corners to resize · double-click text to edit ·
              drop or paste images, videos and text · Ctrl+C / Ctrl+V / Ctrl+D ·
              Del · arrow keys nudge · Ctrl+Z undo · Ctrl+S save
            </p>
          </div>
        </section>

        <div className="flex min-h-0 flex-col gap-4">
          <SlideSettings />
          <div className="min-h-0 flex-1">
            <SavedSlideList />
          </div>
        </div>
      </div>
    </div>
  );
}
