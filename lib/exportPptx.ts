import { PT_PER_CQW, type Slide } from "./types";

/** File -> "mime;base64,XXXX" (the format PptxGenJS expects, without the "data:" prefix) */
function fileToData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).replace(/^data:/, ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function gradientToPng(from: string, to: string): string {
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 1280, 720);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  return c.toDataURL("image/png").replace(/^data:/, "");
}

const hex = (c: string) => c.replace("#", "").toUpperCase();
const ext = (f: File) => f.name.split(".").pop() || "mp4";

export async function exportPptx(slides: Slide[]) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  const W = 10;
  const H = 5.625;

  for (const s of slides) {
    const slide = pptx.addSlide();

    // background
    slide.background = { color: hex(s.bgColor) };
    if (s.bgType === "gradient") {
      slide.background = { data: gradientToPng(s.gradientFrom, s.gradientTo) };
    } else if (s.bgType === "media" && s.bgMedia) {
      const data = await fileToData(s.bgMedia.file);
      if (s.bgMedia.kind === "image") slide.background = { data };
      else slide.addMedia({ type: "video", data, extn: ext(s.bgMedia.file), x: 0, y: 0, w: W, h: H });
    }

    // elements, in z-order
    for (const el of s.elements) {
      const box = {
        x: (el.x / 100) * W,
        y: (el.y / 100) * H,
        w: (el.w / 100) * W,
        h: (el.h / 100) * H,
      };

      if (el.type === "text") {
        if (!(el.text ?? "").trim()) continue;
        slide.addText(el.text ?? "", {
          ...box,
          fontSize: Math.max(1, Math.round((el.fontSize ?? 2.6) * PT_PER_CQW)),
          bold: !!el.bold,
          color: hex(el.color ?? "#ffffff"),
          align: el.align ?? "left",
          valign: "top",
          margin: 0,
          fontFace: "Arial",
        });
      } else if (el.file && el.type === "image") {
        slide.addImage({
          data: await fileToData(el.file),
          ...box,
          sizing: { type: "contain", w: box.w, h: box.h },
        });
      } else if (el.file && el.type === "video") {
        slide.addMedia({ type: "video", data: await fileToData(el.file), extn: ext(el.file), ...box });
      }
    }
  }

  await pptx.writeFile({ fileName: "presentation.pptx" });
}
