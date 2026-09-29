import type { MediaKind, PresentationState, Slide, SlideElement } from "./types";
import { bindId, fromLite, sanitizeLite, toLite, type LitePresentation } from "./lite";

/**
 * Persistence (all client-side, IndexedDB):
 *  - "saved-v3":  the last explicitly saved presentation  (Saved State)
 *  - "draft-v3":  the editor's working copy incl. unsaved changes (Current State) + a dirty flag
 *  - "media":     every image/video File once, by media id (so text edits never rewrite big files)
 *  - "presentation-v2": legacy key (slides with inline Files); still read so old data is not lost.
 */
const DB_NAME = "slide-studio";
const KV = "kv";
const MEDIA = "media";
const SAVED_KEY = "saved-v3";
const DRAFT_KEY = "draft-v3";
const LEGACY_KEY = "presentation-v2";

export interface DraftRecord {
  state: PresentationState;
  dirty: boolean;
}

interface DraftLite {
  presentation: LitePresentation;
  dirty: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not available."));
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(MEDIA)) db.createObjectStore(MEDIA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open IndexedDB."));
    req.onblocked = () => reject(new Error("IndexedDB is blocked by another tab."));
  });
}

const wrap = <T,>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted."));
  });

// ---------- writing ----------
let writeEnabled = false;
/** Only the primary editor tab may write, so two tabs can never overwrite each other. */
export const setPersistenceEnabled = (on: boolean) => {
  writeEnabled = on;
};

let chain: Promise<void> = Promise.resolve();

/** Writes Saved State + the draft. Calls are queued so writes never overlap. */
export function persistAll(saved: PresentationState, draft: DraftRecord): Promise<void> {
  if (!writeEnabled) {
    return Promise.reject(new Error("This tab cannot save because another editor tab is open."));
  }
  const run = () => doPersist(saved, draft);
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

async function doPersist(saved: PresentationState, draft: DraftRecord): Promise<void> {
  const files = new Map<string, File>();
  const savedLite = toLite(saved, files);
  const draftLite: DraftLite = { presentation: toLite(draft.state, files), dirty: draft.dirty };

  const db = await openDb();
  try {
    const existing = new Set(
      (await wrap(db.transaction(MEDIA, "readonly").objectStore(MEDIA).getAllKeys())).map(String)
    );
    const tx = db.transaction([KV, MEDIA], "readwrite");
    const kv = tx.objectStore(KV);
    const media = tx.objectStore(MEDIA);
    for (const [id, file] of files) if (!existing.has(id)) media.put(file, id);
    for (const id of existing) if (!files.has(id)) media.delete(id); // no longer referenced
    kv.put(savedLite, SAVED_KEY);
    kv.put(draftLite, DRAFT_KEY);
    await done(tx);
  } finally {
    db.close();
  }
}

// ---------- reading ----------
export interface RawPersisted {
  saved: LitePresentation | null;
  draft: { presentation: LitePresentation; dirty: boolean } | null;
  media: Map<string, File>;
}

type LegacyEl = Omit<SlideElement, "url">;
type LegacySlide = Omit<Slide, "elements" | "bgMedia"> & {
  elements: LegacyEl[];
  bgMedia?: { kind: MediaKind; file: File };
};

/** Old format: array of slides with Files inline -> lite + media. */
function fromLegacy(raw: unknown, media: Map<string, File>): LitePresentation | null {
  if (!Array.isArray(raw)) return null;
  const files = new Map<string, File>();
  const slides = (raw as LegacySlide[])
    .filter((s) => s && Array.isArray(s.elements))
    .map((s): Slide => ({
      ...s,
      elements: s.elements.map((e) => ({ ...e, url: undefined })),
      bgMedia: s.bgMedia?.file instanceof File ? { ...s.bgMedia, url: "" } : undefined,
    }));
  const lite = toLite({ slides, activeSlideId: slides[0]?.id ?? null }, files);
  for (const [id, f] of files) media.set(id, f);
  return sanitizeLite(lite);
}

/** Lite data + media map, exactly as stored. Never throws; returns empty data on any failure. */
export async function loadPersistedRaw(): Promise<RawPersisted> {
  const empty: RawPersisted = { saved: null, draft: null, media: new Map() };
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (err) {
    console.warn("Persistence unavailable:", err);
    return empty;
  }
  try {
    const media = new Map<string, File>();
    const tx = db.transaction([KV, MEDIA], "readonly");
    const [savedRaw, draftRaw, legacyRaw, keys] = await Promise.all([
      wrap(tx.objectStore(KV).get(SAVED_KEY)),
      wrap(tx.objectStore(KV).get(DRAFT_KEY)),
      wrap(tx.objectStore(KV).get(LEGACY_KEY)),
      wrap(tx.objectStore(MEDIA).getAllKeys()),
    ]);
    for (const k of keys) {
      const f = await wrap(db.transaction(MEDIA, "readonly").objectStore(MEDIA).get(k));
      if (f instanceof Blob) media.set(String(k), f as File);
    }

    let saved = sanitizeLite(savedRaw);
    if (!saved && legacyRaw) saved = fromLegacy(legacyRaw, media);

    let draft: RawPersisted["draft"] = null;
    if (draftRaw && typeof draftRaw === "object") {
      const p = sanitizeLite((draftRaw as { presentation?: unknown }).presentation);
      if (p) draft = { presentation: p, dirty: !!(draftRaw as { dirty?: unknown }).dirty };
    }
    return { saved, draft, media };
  } catch (err) {
    console.warn("Stored presentation is unreadable and was ignored:", err);
    return empty;
  } finally {
    db.close();
  }
}

/** Stored presentations as real slides (with object URLs), ready for the editor. */
export async function loadPersisted(): Promise<{
  saved: PresentationState | null;
  draft: DraftRecord | null;
}> {
  const raw = await loadPersistedRaw();
  const resolve = (id: string) => {
    const f = raw.media.get(id);
    if (f) bindId(f, id);
    return f;
  };
  return {
    saved: raw.saved ? fromLite(raw.saved, resolve) : null,
    draft: raw.draft ? { state: fromLite(raw.draft.presentation, resolve), dirty: raw.draft.dirty } : null,
  };
}
