import JSZip from "jszip";
import {
  IMAGE_TYPES,
  MAX_IMAGE_MB,
  MAX_PPTX_MB,
  MAX_VIDEO_MB,
  VIDEO_TYPES,
  uid,
  type Align,
  type MediaKind,
  type Slide,
  type SlideElement,
} from "./types";
import { urlFor } from "./mediaUrls";

/**
 * Reads a .pptx (Office Open XML) in the browser and converts it to Slide Studio slides.
 * Supported: slide order, text boxes / placeholders (size, bold, colour, alignment, bullets, layout
 * inheritance), pictures, embedded videos, tables (as text), solid / gradient / image backgrounds.
 * Not supported (skipped, reported as warnings): shapes without text, charts, SmartArt, animations,
 * per-run formatting inside one text box, legacy binary .ppt.
 */
export interface ImportResult {
  slides: Slide[];
  warnings: string[];
}

const EMU_PER_INCH = 914400;
const TARGET_ASPECT = 16 / 9;

// ---------- tiny XML helpers (prefix-agnostic) ----------
const kids = (el: Element | null | undefined, name: string): Element[] =>
  el ? Array.from(el.children).filter((c) => c.localName === name) : [];
const kid = (
  el: Element | null | undefined,
  name: string,
): Element | undefined => kids(el, name)[0];
const walk = (
  el: Element | null | undefined,
  ...names: string[]
): Element | undefined => {
  let cur: Element | undefined = el ?? undefined;
  for (const n of names) {
    cur = kid(cur, n);
    if (!cur) return undefined;
  }
  return cur;
};
const desc = (el: Element | null | undefined, name: string): Element[] =>
  el ? Array.from(el.getElementsByTagNameNS("*", name)) : [];
const attr = (el: Element | null | undefined, name: string): string | null => {
  if (!el) return null;
  for (const a of Array.from(el.attributes))
    if (a.localName === name) return a.value;
  return null;
};
const REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
/** r:id / r:embed / r:link (relationship attributes), distinct from a plain `id` attribute. */
const relAttr = (el: Element | null | undefined, name: string): string | null =>
  el?.getAttributeNS(REL_NS, name) ?? null;
const numAttr = (
  el: Element | null | undefined,
  name: string,
): number | null => {
  const v = attr(el, name);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length)
    throw new Error("Invalid XML");
  return doc;
}

// ---------- package helpers ----------
const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/") + 1);
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);

function resolvePath(fromPart: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (dirOf(fromPart) + target).split("/");
  const out: string[] = [];
  for (const seg of parts) {
    if (seg === "..") out.pop();
    else if (seg && seg !== ".") out.push(seg);
  }
  return out.join("/");
}

interface Rel {
  type: string;
  target: string; // resolved path inside the zip ("" when external)
  external: boolean;
}

class Pkg {
  private docs = new Map<string, Document | null>();
  private rels = new Map<string, Map<string, Rel>>();
  private files = new Map<string, File | null>();
  warnings = new Set<string>();

  constructor(private zip: JSZip) {}

  async doc(path: string): Promise<Document | null> {
    if (this.docs.has(path)) return this.docs.get(path) ?? null;
    let doc: Document | null = null;
    const f = this.zip.file(path);
    if (f) {
      try {
        doc = parseXml(await f.async("string"));
      } catch {
        doc = null;
      }
    }
    this.docs.set(path, doc);
    return doc;
  }

  async relsOf(part: string): Promise<Map<string, Rel>> {
    const cached = this.rels.get(part);
    if (cached) return cached;
    const map = new Map<string, Rel>();
    const doc = await this.doc(`${dirOf(part)}_rels/${baseName(part)}.rels`);
    for (const r of desc(doc?.documentElement, "Relationship")) {
      const id = attr(r, "Id");
      const target = attr(r, "Target");
      if (!id || !target) continue;
      const external = attr(r, "TargetMode") === "External";
      map.set(id, {
        type: attr(r, "Type") ?? "",
        target: external ? "" : resolvePath(part, target),
        external,
      });
    }
    this.rels.set(part, map);
    return map;
  }

  /** A media part as a File, or null (with a warning) when unsupported / too large. Cached per path. */
  async media(path: string): Promise<{ file: File; kind: MediaKind } | null> {
    const cached = this.files.get(path);
    if (cached !== undefined)
      return cached ? { file: cached, kind: kindOf(cached.type)! } : null;
    const result = await this.readMedia(path);
    this.files.set(path, result?.file ?? null);
    return result;
  }

  private async readMedia(
    path: string,
  ): Promise<{ file: File; kind: MediaKind } | null> {
    const entry = this.zip.file(path);
    if (!entry) return null;
    const name = baseName(path);
    const type = MIME[name.split(".").pop()?.toLowerCase() ?? ""];
    const kind = type ? kindOf(type) : null;
    if (!type || !kind) {
      this.warnings.add(`Skipped "${name}": unsupported media format.`);
      return null;
    }
    const blob = await entry.async("blob");
    const mb = blob.size / 1024 / 1024;
    if (kind === "image" && mb > MAX_IMAGE_MB) {
      this.warnings.add(
        `Skipped "${name}": image is larger than ${MAX_IMAGE_MB} MB.`,
      );
      return null;
    }
    if (kind === "video" && mb > MAX_VIDEO_MB) {
      this.warnings.add(
        `Skipped "${name}": video is larger than ${MAX_VIDEO_MB} MB.`,
      );
      return null;
    }
    return { file: new File([blob], name, { type }), kind };
  }
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  ogv: "video/ogg",
};
const kindOf = (mime: string): MediaKind | null =>
  IMAGE_TYPES.includes(mime)
    ? "image"
    : VIDEO_TYPES.includes(mime)
      ? "video"
      : null;

// ---------- colours ----------
interface Theme {
  colors: Record<string, string>; // dk1, lt1, accent1...
  clrMap: Record<string, string>; // bg1 -> lt1 ...
}

const PRESET: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  gray: "#808080",
  grey: "#808080",
};

function hslToHex(h: number, s: number, l: number): string {
  const f = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r = l,
    g = l,
    b = l;
  if (s) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = f(p, q, h + 1 / 3);
    g = f(p, q, h);
    b = f(p, q, h - 1 / 3);
  }
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function adjustLuminance(hex: string, mod: number, off: number): string {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2,
    d = max - min;
  let h = 0,
    s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h =
      max === r
        ? (g - b) / d + (g < b ? 6 : 0)
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h /= 6;
  }
  return hslToHex(h, s, Math.min(1, Math.max(0, l * mod + off)));
}

/** `el` is a container (solidFill, a:defRPr/solidFill...) whose child is a colour element. */
function colorOf(el: Element | null | undefined, theme: Theme): string | null {
  const c =
    el &&
    Array.from(el.children).find((k) =>
      ["srgbClr", "schemeClr", "sysClr", "prstClr"].includes(k.localName),
    );
  if (!c) return null;
  let hex: string | null = null;
  const val = attr(c, "val");
  if (c.localName === "srgbClr" && val && /^[0-9a-f]{6}$/i.test(val))
    hex = `#${val.toLowerCase()}`;
  else if (c.localName === "sysClr") {
    const last = attr(c, "lastClr");
    hex = last
      ? `#${last.toLowerCase()}`
      : val === "windowText"
        ? "#000000"
        : "#ffffff";
  } else if (c.localName === "prstClr") hex = PRESET[val ?? ""] ?? null;
  else if (c.localName === "schemeClr" && val) {
    hex = theme.colors[theme.clrMap[val] ?? val] ?? null;
  }
  if (!hex) return null;
  const lumMod = numAttr(kid(c, "lumMod"), "val");
  const lumOff = numAttr(kid(c, "lumOff"), "val");
  if (lumMod !== null || lumOff !== null) {
    hex = adjustLuminance(
      hex,
      (lumMod ?? 100000) / 100000,
      (lumOff ?? 0) / 100000,
    );
  }
  return hex;
}

const isDark = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
};

// ---------- geometry ----------
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
} // EMU
type Tx = (b: Box) => Box;

function xfrmOf(spPr: Element | null | undefined, isFrame = false): Box | null {
  const x = isFrame ? kid(spPr, "xfrm") : walk(spPr, "xfrm");
  const off = kid(x, "off");
  const ext = kid(x, "ext");
  const ox = numAttr(off, "x"),
    oy = numAttr(off, "y"),
    cx = numAttr(ext, "cx"),
    cy = numAttr(ext, "cy");
  if (ox === null || oy === null || cx === null || cy === null) return null;
  return { x: ox, y: oy, w: cx, h: cy };
}

// ---------- placeholders ----------
interface Ph {
  type: string | null;
  idx: string | null;
}

const phOf = (sp: Element): Ph | null => {
  const ph =
    desc(walk(sp, "nvSpPr", "nvPr"), "ph")[0] ??
    desc(walk(sp, "nvPicPr", "nvPr"), "ph")[0];
  return ph ? { type: attr(ph, "type"), idx: attr(ph, "idx") } : null;
};
const isTitle = (ph: Ph | null) =>
  !!ph && (ph.type === "title" || ph.type === "ctrTitle");

function matchPlaceholder(root: Document | null, ph: Ph): Element | null {
  const tree = walk(root?.documentElement, "cSld", "spTree");
  for (const sp of kids(tree, "sp")) {
    const p = phOf(sp);
    if (!p) continue;
    if (ph.idx && p.idx === ph.idx) return sp;
  }
  for (const sp of kids(tree, "sp")) {
    const p = phOf(sp);
    if (!p) continue;
    const norm = (t: string | null) =>
      t === "ctrTitle" ? "title" : t === "subTitle" ? "body" : (t ?? "body");
    if (norm(p.type) === norm(ph.type)) return sp;
  }
  return null;
}

// ---------- backgrounds ----------
type Bg = Pick<
  Slide,
  "bgType" | "bgColor" | "gradientFrom" | "gradientTo" | "bgMedia"
>;

async function backgroundOf(
  doc: Document | null,
  part: string,
  pkg: Pkg,
  theme: Theme,
): Promise<Partial<Bg> | null> {
  const bg = walk(doc?.documentElement, "cSld", "bg");
  if (!bg) return null;
  const pr = kid(bg, "bgPr");
  const fill = pr ?? kid(bg, "bgRef");
  if (!fill) return null;

  if (kid(pr, "gradFill")) {
    const stops = desc(kid(pr, "gradFill"), "gs")
      .map((g) => colorOf(g, theme))
      .filter((c): c is string => !!c);
    if (stops.length >= 2) {
      return {
        bgType: "gradient",
        gradientFrom: stops[0],
        gradientTo: stops[stops.length - 1],
      };
    }
    if (stops.length === 1) return { bgType: "color", bgColor: stops[0] };
  }
  const blip = desc(kid(pr, "blipFill"), "blip")[0];
  if (blip) {
    const rel = (await pkg.relsOf(part)).get(relAttr(blip, "embed") ?? "");
    const m = rel && !rel.external ? await pkg.media(rel.target) : null;
    if (m && m.kind === "image") {
      return {
        bgType: "media",
        bgMedia: { kind: "image", file: m.file, url: "" },
      };
    }
  }
  const solid =
    kid(pr, "solidFill") ?? (kid(bg, "bgRef") ? kid(bg, "bgRef") : undefined);
  const color = colorOf(solid, theme);
  return color ? { bgType: "color", bgColor: color } : null;
}

// ---------- text ----------
interface TextStyleChain {
  lvl1: Element[]; // a:lvl1pPr elements, highest priority first
}

const lvl1Of = (body: Element | null | undefined) =>
  walk(body, "lstStyle", "lvl1pPr");

function firstAttr(chain: Element[], name: string): string | null {
  for (const el of chain) {
    const v = attr(el, name);
    if (v !== null) return v;
  }
  return null;
}

function alignOf(v: string | null): Align | null {
  return v === "ctr"
    ? "center"
    : v === "r"
      ? "right"
      : v === "l"
        ? "left"
        : null;
}

interface TextResult {
  text: string;
  el: Partial<SlideElement>;
}

function textOf(
  body: Element,
  chain: TextStyleChain,
  theme: Theme,
  defaultColor: string,
  ph: Ph | null,
  ptToCqw: number,
): TextResult | null {
  const lines: string[] = [];
  let firstRun: Element | undefined;
  let firstPara: Element | undefined;

  for (const p of kids(body, "p")) {
    let line = "";
    for (const n of Array.from(p.children)) {
      if (n.localName === "r" || n.localName === "fld") {
        const t = kid(n, "t")?.textContent ?? "";
        if (t && !firstRun) {
          firstRun = kid(n, "rPr");
          firstPara = p;
        }
        line += t;
      } else if (n.localName === "br") line += "\n";
    }
    const pPr = kid(p, "pPr");
    const level = numAttr(pPr, "lvl") ?? 0;
    const bulletNone = !!kid(pPr, "buNone");
    const hasBullet =
      !!kid(pPr, "buChar") ||
      !!kid(pPr, "buAutoNum") ||
      (!bulletNone &&
        !isTitle(ph) &&
        !!ph &&
        chain.lvl1.some((l) => !!kid(l, "buChar")));
    if (line.trim() && hasBullet) line = "• " + line;
    if (level > 0) line = "  ".repeat(level) + line;
    lines.push(line);
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const text = lines.join("\n");
  if (!text.trim()) return null;

  const pPr = kid(firstPara, "pPr");
  const defRPr = chain.lvl1
    .map((l) => kid(l, "defRPr"))
    .filter((d): d is Element => !!d);
  const rprChain = [firstRun, ...defRPr].filter((d): d is Element => !!d);

  const sz = firstAttr(rprChain, "sz");
  let pt = sz && Number(sz) > 0 ? Number(sz) / 100 : isTitle(ph) ? 32 : 18;
  const fontScale = numAttr(walk(body, "bodyPr", "normAutofit"), "fontScale");
  if (fontScale) pt *= fontScale / 100000;

  let color: string | null = null;
  for (const r of rprChain) {
    color = colorOf(kid(r, "solidFill"), theme);
    if (color) break;
  }
  const bold = firstAttr(rprChain, "b") === "1";
  const align =
    alignOf(attr(pPr, "algn")) ??
    alignOf(firstAttr(chain.lvl1, "algn")) ??
    "left";

  return {
    text,
    el: {
      text,
      fontSize: Math.max(0.8, Math.round(pt * ptToCqw * 100) / 100),
      color: color ?? defaultColor,
      bold,
      align,
    },
  };
}

function tableText(tbl: Element): string {
  return kids(tbl, "tr")
    .map((tr) =>
      kids(tr, "tc")
        .map((tc) =>
          desc(tc, "t")
            .map((t) => t.textContent ?? "")
            .join(""),
        )
        .join("  |  "),
    )
    .join("\n");
}

// ---------- main ----------
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export async function importPptx(file: File): Promise<ImportResult> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".ppt")) {
    throw new Error(
      "Legacy .ppt files are not supported. Open it in PowerPoint and save it as .pptx.",
    );
  }
  if (!lower.endsWith(".pptx"))
    throw new Error(`"${file.name}" is not a .pptx file.`);
  if (file.size / 1024 / 1024 > MAX_PPTX_MB)
    throw new Error(`"${file.name}" is larger than ${MAX_PPTX_MB} MB.`);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error(
      `"${file.name}" is not a valid PowerPoint file (it could not be opened).`,
    );
  }
  const pkg = new Pkg(zip);
  const pres = await pkg.doc("ppt/presentation.xml");
  if (!pres)
    throw new Error(
      `"${file.name}" is not a valid PowerPoint file (presentation.xml is missing).`,
    );

  // slide size and how it maps onto our fixed 16:9 canvas
  const sz = desc(pres.documentElement, "sldSz")[0];
  const W = numAttr(sz, "cx") ?? 9144000;
  const H = numAttr(sz, "cy") ?? 5143500;
  const aspect = W / H;
  const scaleX = aspect < TARGET_ASPECT - 0.01 ? aspect / TARGET_ASPECT : 1;
  const scaleY = aspect > TARGET_ASPECT + 0.01 ? TARGET_ASPECT / aspect : 1;
  const offX = ((1 - scaleX) / 2) * 100;
  const offY = ((1 - scaleY) / 2) * 100;
  const ptToCqw = (100 / (72 * (W / EMU_PER_INCH))) * scaleX;
  const pct = (b: Box) => ({
    x: clamp(offX + (b.x / W) * 100 * scaleX, 0, 100),
    y: clamp(offY + (b.y / H) * 100 * scaleY, 0, 100),
    w: clamp((b.w / W) * 100 * scaleX, 1, 100),
    h: clamp((b.h / H) * 100 * scaleY, 1, 100),
  });

  // theme + colour map (from the first master)
  const presRels = await pkg.relsOf("ppt/presentation.xml");
  const rels = Array.from(presRels.values());
  const masterPath =
    rels.find((r) => r.type.endsWith("/slideMaster"))?.target ??
    "ppt/slideMasters/slideMaster1.xml";
  const masterDoc = await pkg.doc(masterPath);
  const masterRels = await pkg.relsOf(masterPath);
  const themePath =
    Array.from(masterRels.values()).find((r) => r.type.endsWith("/theme"))
      ?.target ?? "ppt/theme/theme1.xml";
  const themeDoc = await pkg.doc(themePath);
  const theme: Theme = { colors: {}, clrMap: {} };
  const scheme = desc(themeDoc?.documentElement, "clrScheme")[0];
  for (const c of Array.from(scheme?.children ?? [])) {
    const v = kid(c, "srgbClr");
    const s = kid(c, "sysClr");
    const hex = attr(v, "val") ?? attr(s, "lastClr");
    if (hex) theme.colors[c.localName] = `#${hex.toLowerCase()}`;
  }
  const cm = kid(masterDoc?.documentElement, "clrMap");
  for (const a of Array.from(cm?.attributes ?? []))
    theme.clrMap[a.localName] = a.value;
  if (!cm)
    Object.assign(theme.clrMap, {
      bg1: "lt1",
      tx1: "dk1",
      bg2: "lt2",
      tx2: "dk2",
    });

  const masterBg = await backgroundOf(masterDoc, masterPath, pkg, theme);
  const masterTextColor = theme.colors[theme.clrMap.tx1 ?? "dk1"] ?? "#000000";

  const order = desc(pres.documentElement, "sldId")
    .map((s) => presRels.get(relAttr(s, "id") ?? ""))
    .filter((r): r is Rel => !!r && !r.external);

  const slides: Slide[] = [];
  const warnings: string[] = [];
  let skippedShapes = 0;

  for (let i = 0; i < order.length; i++) {
    try {
      const slidePath = order[i].target;
      const doc = await pkg.doc(slidePath);
      if (!doc) throw new Error("unreadable");
      const slideRels = await pkg.relsOf(slidePath);

      const layoutPath =
        Array.from(slideRels.values()).find((r) =>
          r.type.endsWith("/slideLayout"),
        )?.target ?? "";
      const layoutDoc = layoutPath ? await pkg.doc(layoutPath) : null;

      const own = await backgroundOf(doc, slidePath, pkg, theme);
      const fromLayout = own
        ? null
        : await backgroundOf(layoutDoc, layoutPath, pkg, theme);
      let bg: Partial<Bg> = own ??
        fromLayout ??
        masterBg ?? { bgType: "color" as const, bgColor: "#ffffff" };
      const bgIsDark =
        bg.bgType === "color"
          ? isDark(bg.bgColor ?? "#ffffff")
          : bg.bgType === "gradient"
            ? isDark(bg.gradientFrom ?? "#ffffff")
            : true;
      const defaultColor =
        masterTextColor && isDark(masterTextColor) !== bgIsDark
          ? masterTextColor
          : bgIsDark
            ? "#ffffff"
            : "#000000";

      const elements: SlideElement[] = [];
      const tree = walk(doc.documentElement, "cSld", "spTree");

      const visit = async (parent: Element | undefined, tx: Tx) => {
        for (const node of Array.from(parent?.children ?? [])) {
          if (node.localName === "grpSp") {
            const gx = walk(node, "grpSpPr", "xfrm");
            const off = kid(gx, "off"),
              ext = kid(gx, "ext"),
              cOff = kid(gx, "chOff"),
              cExt = kid(gx, "chExt");
            const ox = numAttr(off, "x"),
              oy = numAttr(off, "y"),
              cx = numAttr(ext, "cx"),
              cy = numAttr(ext, "cy");
            const chx = numAttr(cOff, "x"),
              chy = numAttr(cOff, "y"),
              chw = numAttr(cExt, "cx"),
              chh = numAttr(cExt, "cy");
            if (
              [ox, oy, cx, cy, chx, chy, chw, chh].some((v) => v === null) ||
              !chw ||
              !chh
            ) {
              await visit(node, tx);
              continue;
            }
            const sx = cx! / chw,
              sy = cy! / chh;
            await visit(node, (b) =>
              tx({
                x: ox! + (b.x - chx!) * sx,
                y: oy! + (b.y - chy!) * sy,
                w: b.w * sx,
                h: b.h * sy,
              }),
            );
          } else if (node.localName === "sp") {
            const ph = phOf(node);
            const body = kid(node, "txBody");
            let box = xfrmOf(kid(node, "spPr"));
            const layoutSp = ph ? matchPlaceholder(layoutDoc, ph) : null;
            const masterSp = ph ? matchPlaceholder(masterDoc, ph) : null;
            if (!box && ph)
              box =
                xfrmOf(kid(layoutSp, "spPr")) ?? xfrmOf(kid(masterSp, "spPr"));
            const hasText =
              !!body &&
              desc(body, "t").some((t) => (t.textContent ?? "").trim());
            if (!body || !hasText) {
              if (!ph) skippedShapes++;
              continue;
            }
            if (!box) continue;

            const masterStyles = walk(
              masterDoc?.documentElement,
              "txStyles",
              isTitle(ph) ? "titleStyle" : "bodyStyle",
            );
            const chain: TextStyleChain = {
              lvl1: [
                lvl1Of(body),
                lvl1Of(kid(layoutSp, "txBody")),
                lvl1Of(kid(masterSp, "txBody")),
                kid(masterStyles, "lvl1pPr"),
              ].filter((e): e is Element => !!e),
            };
            const t = textOf(body, chain, theme, defaultColor, ph, ptToCqw);
            if (t)
              elements.push({
                id: uid(),
                type: "text",
                ...pct(tx(box)),
                ...t.el,
              } as SlideElement);
          } else if (node.localName === "pic") {
            const box = xfrmOf(kid(node, "spPr"));
            if (!box) continue;
            const nvPr = walk(node, "nvPicPr", "nvPr");
            const videoRef =
              desc(nvPr, "videoFile")[0] ?? desc(nvPr, "media")[0];
            const blip = desc(kid(node, "blipFill"), "blip")[0];
            const relId = videoRef
              ? (relAttr(videoRef, "link") ?? relAttr(videoRef, "embed"))
              : relAttr(blip, "embed");
            const rel = relId ? slideRels.get(relId) : undefined;
            if (!rel || rel.external) {
              if (videoRef)
                warnings.push(
                  `Slide ${i + 1}: a linked (external) video was skipped.`,
                );
              continue;
            }
            const m = await pkg.media(rel.target);
            if (!m) continue;

            // PPTX has no real "video background": presenters fake it with a video picture sized to
            // cover the whole slide. Detect that and treat it as the slide's background instead of a
            // movable element, so it gets the autoplay/loop/mute behaviour real backgrounds get.
            const full = tx(box);
            const coversSlide =
              m.kind === "video" &&
              full.w >= W * 0.9 &&
              full.h >= H * 0.9 &&
              full.x <= W * 0.05 &&
              full.y <= H * 0.05;

            if (coversSlide) {
              bg = {
                ...bg,
                bgType: "media",
                bgMedia: { kind: "video", file: m.file, url: "" },
              };
            } else {
              elements.push({
                id: uid(),
                type: m.kind,
                ...pct(full),
                file: m.file,
              });
            }
          } else if (node.localName === "graphicFrame") {
            const tbl = desc(node, "tbl")[0];
            const box = xfrmOf(node, true);
            if (tbl && box) {
              const text = tableText(tbl);
              if (text.trim()) {
                elements.push({
                  id: uid(),
                  type: "text",
                  ...pct(tx(box)),
                  text,
                  fontSize: Math.max(0.8, 14 * ptToCqw),
                  color: defaultColor,
                  bold: false,
                  align: "left",
                });
              }
            } else skippedShapes++;
          }
        }
      };
      await visit(tree, (b) => b);

      slides.push({
        id: uid(),
        elements,
        bgType: bg.bgType ?? "color",
        bgColor: bg.bgColor ?? "#ffffff",
        gradientFrom: bg.gradientFrom ?? "#4f46e5",
        gradientTo: bg.gradientTo ?? "#0ea5e9",
        bgMedia: bg.bgMedia,
      });
    } catch (err) {
      console.warn(`Slide ${i + 1} could not be imported:`, err);
      warnings.push(`Slide ${i + 1} could not be read and was skipped.`);
    }
  }

  if (!slides.length)
    throw new Error(`No readable slides were found in "${file.name}".`);
  if (skippedShapes)
    warnings.push(
      `${skippedShapes} shape(s) without text (or charts/SmartArt) were skipped.`,
    );
  warnings.push(...pkg.warnings);

  // Object URLs are created last and synchronously, right before the slides are inserted.
  for (const s of slides) {
    if (s.bgMedia) s.bgMedia = { ...s.bgMedia, url: urlFor(s.bgMedia.file) };
    for (const e of s.elements) if (e.file) e.url = urlFor(e.file);
  }
  return { slides, warnings };
}
