"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileUp,
  Save,
  TriangleAlert,
} from "lucide-react";
import { selectIsDirty, useSlideStore } from "@/store/slideStore";
import { exportPptx } from "@/lib/exportPptx";
import { importPptx } from "@/lib/importPptx";
import { SECOND_SCREEN_URL } from "@/lib/sync";
import type { PreviewMode } from "@/lib/types";
import BackgroundControls from "./BackgroundControls";

type Notice = { kind: "ok" | "warn" | "error"; text: string } | null;
type ImportMode = "append" | "replace";

const PPTX_ACCEPT =
  ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation";

const SOURCES: { id: PreviewMode; label: string; hint: string }[] = [
  {
    id: "current",
    label: "Current",
    hint: "Live editor, including unsaved changes",
  },
  { id: "saved", label: "Saved", hint: "The last version you saved" },
];

/** Save / Import / Download / second-screen source. Everything here works on the Current State. */
export default function ProjectBar() {
  const dirty = useSlideStore(selectIsDirty);
  const previewMode = useSlideStore((s) => s.previewMode);
  const saveError = useSlideStore((s) => s.saveError);
  const lastSavedAt = useSlideStore((s) => s.lastSavedAt);
  const st = useSlideStore.getState;

  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importMode = useRef<ImportMode>("append");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const save = async () => {
    setSaving(true);
    const ok = await st().save();
    setSaving(false);
    setNotice(
      ok
        ? {
            kind: "ok",
            text: "Saved. The Saved copy now matches what you see in the editor.",
          }
        : {
            kind: "warn",
            text: `Saved for this session, but it could not be stored: ${st().saveError ?? "unknown error"}`,
          },
    );
  };

  const pickImport = (mode: ImportMode) => {
    setMenu(false);
    if (
      mode === "replace" &&
      !window.confirm(
        "Replace ALL current slides with the imported presentation? You can undo with Ctrl+Z.",
      )
    ) {
      return;
    }
    importMode.current = mode;
    fileRef.current?.click();
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const { slides, warnings } = await importPptx(file);
      st().importSlides(slides, importMode.current);
      const verb = importMode.current === "append" ? "Added" : "Replaced with";
      setNotice({
        kind: warnings.length ? "warn" : "ok",
        text:
          `${verb} ${slides.length} slide${slides.length === 1 ? "" : "s"} from "${file.name}" ` +
          `into your Saved slides.` +
          (warnings.length ? ` Notes: ${warnings.join(" ")}` : ""),
      });
    } catch (err) {
      console.error(err);
      setNotice({
        kind: "error",
        text:
          err instanceof Error
            ? err.message
            : "The PowerPoint file could not be imported.",
      });
    } finally {
      setImporting(false);
    }
  };

  const download = async () => {
    setExporting(true);
    try {
      await exportPptx(st().slides); // downloads the CURRENT presentation; does not touch Saved State
    } catch (err) {
      console.error(err);
      setNotice({
        kind: "error",
        text: "Could not export the PPTX file. See the console for details.",
      });
    } finally {
      setExporting(false);
    }
  };

  const openSecondScreen = () => {
    // Named window: clicking again focuses the existing second screen instead of piling up new tabs.
    const win = window.open(SECOND_SCREEN_URL, "slide-studio-second-screen");
    if (!win)
      setNotice({
        kind: "error",
        text: "Pop-up blocked. Allow pop-ups for this site and try again.",
      });
    else win.focus();
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={saving}
          title="Save (Ctrl+S)"
        >
          <Save size={16} /> {saving ? "Saving…" : "Save"}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            className="btn btn-ghost"
            onClick={() => setMenu((m) => !m)}
            disabled={importing}
            aria-haspopup="menu"
          >
            <FileUp size={16} /> {importing ? "Importing…" : "Import PPT"}{" "}
            <ChevronDown size={14} />
          </button>
          {menu && (
            <div
              role="menu"
              className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-slate-600 bg-slate-800 p-1 shadow-xl"
            >
              <button
                role="menuitem"
                className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-700"
                onClick={() => pickImport("append")}
              >
                <span className="font-medium">
                  Add to existing presentation
                </span>
                <span className="block text-xs text-slate-400">
                  Imported slides are appended; nothing is deleted.
                </span>
              </button>
              <button
                role="menuitem"
                className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-700"
                onClick={() => pickImport("replace")}
              >
                <span className="font-medium">
                  Replace current presentation
                </span>
                <span className="block text-xs text-slate-400">
                  Asks for confirmation. Can be undone.
                </span>
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={PPTX_ACCEPT}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void onImportFile(f);
            }}
          />
        </div>

        <button
          className="btn btn-ghost"
          onClick={download}
          disabled={exporting}
          title="Download the current presentation as .pptx"
        >
          <Download size={16} /> {exporting ? "Exporting…" : "Download"}
        </button>
        <BackgroundControls />
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
            dirty
              ? "bg-amber-500/15 text-amber-300"
              : "bg-emerald-500/15 text-emerald-300"
          }`}
          data-testid="save-status"
        >
          {dirty ? <TriangleAlert size={13} /> : <CheckCircle2 size={13} />}
          {dirty
            ? "Unsaved changes"
            : lastSavedAt
              ? "All changes saved"
              : "No changes"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-700 pt-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Second screen
        </span>
        <div
          role="radiogroup"
          aria-label="Second screen source"
          className="inline-flex rounded-lg bg-slate-900 p-0.5"
        >
          {SOURCES.map((o) => {
            const active = previewMode === o.id;
            return (
              <button
                key={o.id}
                role="radio"
                aria-checked={active}
                title={o.hint}
                onClick={() => st().setPreviewMode(o.id)}
                className={`rounded-md px-3 py-1 text-sm transition ${
                  active
                    ? "bg-indigo-500 text-white"
                    : "text-slate-300 hover:bg-slate-700"
                }`}
              >
                {active ? "●" : "○"} {o.label}
              </button>
            );
          })}
        </div>
        <button className="btn btn-ghost !py-1.5" onClick={openSecondScreen}>
          <ExternalLink size={15} /> Open second screen
        </button>
        <span className="text-xs text-slate-400">
          {previewMode === "current"
            ? "Showing the editor live, including unsaved changes."
            : dirty
              ? "Showing the last saved version (your unsaved changes are hidden)."
              : "Showing the last saved version."}
        </span>
      </div>

      {(notice || saveError) && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-xs ${
            notice?.kind === "error"
              ? "bg-red-500/15 text-red-300"
              : notice?.kind === "warn" || !notice
                ? "bg-amber-500/15 text-amber-200"
                : "bg-emerald-500/15 text-emerald-300"
          }`}
        >
          {notice?.text ??
            `Could not store the saved presentation: ${saveError}`}
          {notice && (
            <button className="ml-2 underline" onClick={() => setNotice(null)}>
              dismiss
            </button>
          )}
        </p>
      )}
    </div>
  );
}
