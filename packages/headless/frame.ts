import { Resvg } from "@resvg/resvg-js";
import { fileURLToPath } from "node:url";
import { renderProjectSvg } from "../renderer/svg";
import type { Project } from "../core/schema";
export const fontFiles = [
  "DejaVuSans",
  "DejaVuSans-Bold",
  "DejaVuSansMono",
  "DejaVuSansMono-Bold",
].map((name) =>
  fileURLToPath(new URL(`../../assets/fonts/${name}.ttf`, import.meta.url)),
);
export function rasterFrame(project: Project, time: number) {
  return new Resvg(renderProjectSvg(project, time), {
    font: {
      loadSystemFonts: false,
      fontFiles,
      defaultFontFamily: project.fontFamily ?? "DejaVu Sans",
    },
  }).render();
}
