import { Resvg } from "@resvg/resvg-js";
import { fileURLToPath } from "node:url";
import { renderProjectSvg } from "../renderer/svg";
import type { Project } from "../core/schema";
import { createHash } from "node:crypto";
export const fontFiles = [
  "DejaVuSans",
  "DejaVuSans-Bold",
  "DejaVuSansMono",
  "DejaVuSansMono-Bold",
].map((name) =>
  fileURLToPath(new URL(`../../assets/fonts/${name}.ttf`, import.meta.url)),
);
export function rasterFrame(project: Project, time: number) {
  return rasterSvg(project, renderProjectSvg(project, time));
}
function rasterSvg(project: Project, svg: string) {
  return new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles,
      defaultFontFamily: project.fontFamily ?? "DejaVu Sans",
    },
  }).render();
}
/** One raster per worker: bounded memory, including long static scenes. */
export function createFrameRasterizer(project: Project) {
  let previousHash = "",
    previousPixels: Uint8Array | undefined;
  let rasterized = 0,
    reused = 0;
  return {
    render(time: number) {
      const svg = renderProjectSvg(project, time);
      const hash = createHash("sha256").update(svg).digest("hex");
      if (previousPixels && hash === previousHash) {
        reused++;
        return previousPixels;
      }
      previousHash = hash;
      previousPixels = rasterSvg(project, svg).pixels;
      rasterized++;
      return previousPixels;
    },
    stats: () => ({ rasterized, reused }),
  };
}
