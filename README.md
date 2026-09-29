# Slide Studio (Next.js)

A small PowerPoint-style editor: free-positioned text, images and videos, background
image/video, live preview, and a presentation that opens in a new browser tab.

## Run
```bash
pnpm install
pnpm dev
```
Open http://localhost:3000

## Editor
- **Current preview (big)**: edit here. Drag to move, corners to resize, double-click text to edit.
- **Live preview (small, right)**: exactly what the presentation tab will show.
- **Add**: toolbar buttons, drag files from your computer onto the canvas, or paste (Ctrl+V)
  an image, video or text. Pasting text creates a text box.
- **Background**: color, gradient, or an image / video (video is muted and loops).
  Any image/video element can be turned into the background with "Set as background".
- **Shortcuts**: Ctrl+C / Ctrl+X / Ctrl+V (copy elements, even across slides), Ctrl+D duplicate,
  Del delete, arrow keys nudge (Shift = bigger step), Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo.
- **Save** (Ctrl+S) copies the Current State into the Saved State. **Download** exports the current
  presentation as .pptx and does *not* save. **Import PPT** adds the slides of another .pptx to the end
  of the presentation (or replaces it, after confirmation; undoable). Imported slides are unsaved until Save.
- **Second screen**: `Open second screen` opens `/present`, a display-only viewer. The toggle
  `Current | Saved` decides what it shows:
  - **Current**: the live editor, including unsaved changes, and the slide selected in the editor.
  - **Saved**: the last saved snapshot (its own slides and the slide that was active when saved).

## State model
- `slides` / `slideId` (store) = **Current State**. `savedSlides` / `savedSlideId` = **Saved State**, a deep
  clone made by `save()`; the two never share objects (media `File`s are immutable and shared).
- Tab sync: `lib/sync.ts` publishes both states over a `BroadcastChannel`; the viewer only sends `hello`
  (so it can never write back). Media files are sent once by id. A refreshed viewer asks for the state again,
  or falls back to IndexedDB (saved copy + draft) when the editor is closed.
- Persistence (IndexedDB, `lib/db.ts`): saved copy, unsaved draft, media by id. Only one editor tab
  (Web Lock) saves and drives the second screen.

## Structure
- `app/page.tsx`: editor page
- `app/present/page.tsx`: presentation page (new tab)
- `store/slideStore.ts`: Zustand store (slides, selection, clipboard, undo/redo)
- `components/SlideEditor.tsx`: layout, keyboard/paste/copy handlers, submit
- `components/EditorCanvas.tsx`: interactive canvas (drag, resize, drop, inline text edit)
- `components/EditorToolbar.tsx`: add / text formatting / arrange
- `components/SlideSettings.tsx`: live preview + background controls
- `components/SlideList.tsx`: slide thumbnails
- `components/SlideParts.tsx`, `SlideCanvas.tsx`: read-only rendering (shared by all previews)
- `components/SecondScreen.tsx`: display-only second screen (`/present`)
- `components/ProjectBar.tsx`: Save / Import PPT / Download / second-screen source toggle
- `lib/sync.ts`, `lib/editorSession.ts`: BroadcastChannel sync, single-editor lock, hydrate, draft persistence
- `lib/lite.ts`, `lib/clone.ts`, `lib/mediaUrls.ts`: serialisable form, deep clone, object-URL cleanup
- `lib/importPptx.ts`: .pptx reader (JSZip)
- `lib/media.ts`: file validation and adding files as elements
- `lib/db.ts`: IndexedDB persistence (saved copy, draft, media)
- `lib/exportPptx.ts`: PptxGenJS export (uses the same positions)

## Notes
- Everything stays in the browser. Refreshing the editor restores the saved copy and the unsaved draft.
- Limits: images 10 MB, videos 50 MB (`lib/types.ts`).
- In the exported PPTX a background video is a full-slide video behind the other elements; it does
  not autoplay/loop like it does in the browser. Best played in desktop PowerPoint.
- PPTX import: text boxes/placeholders (first-run size, bold, colour, alignment, bullets), pictures, embedded
  videos (mp4/webm/ogg), tables (as text) and solid/gradient/image backgrounds. Shapes without text, charts,
  SmartArt, animations and per-word formatting are skipped; 4:3 decks are letterboxed into the 16:9 canvas.
- Checks: `pnpm typecheck` and `pnpm build`.
