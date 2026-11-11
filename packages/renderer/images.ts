import { decodeBase64, type Assets } from "../core/assets";
import type { SceneElement } from "../core/elements";
export function imageSvg(
  e: Extract<SceneElement, { type: "image" }>,
  assets: Assets,
): string {
  const asset =
    e.src.startsWith("asset:") && Object.hasOwn(assets, e.src.slice(6))
      ? assets[e.src.slice(6)]
      : undefined;
  if (!asset)
    throw new Error(
      `Image non résolue : ${e.src}. Importer les ressources avant le rendu.`,
    );
  const width = asset.width ?? e.w,
    height = asset.height ?? e.h;
  let content = `<image href="data:${asset.mime};base64,${asset.data}" width="${width}" height="${height}"/>`;
  if (e.pixelate > 0) {
    if (!asset.sample) throw new Error("Image à décoder avant pixelisation.");
    const { width: sw, height: sh } = asset.sample,
      bytes = decodeBase64(asset.sample.data);
    const cols = Math.min(sw, Math.max(1, Math.ceil(e.w / e.pixelate))),
      rows = Math.min(sh, Math.max(1, Math.ceil(e.h / e.pixelate)));
    content = "";
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i =
          (Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / rows)) * sw +
            Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / cols))) *
          4;
        content += `<rect x="${(x * width) / cols}" y="${(y * height) / rows}" width="${width / cols + 0.01}" height="${height / rows + 0.01}" fill="rgb(${bytes[i]},${bytes[i + 1]},${bytes[i + 2]})" opacity="${bytes[i + 3] / 255}"/>`;
      }
  }
  const crop = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const viewWidth = (width * crop.w) / e.zoom,
    viewHeight = (height * crop.h) / e.zoom,
    vx = width * crop.x + (width * crop.w - viewWidth) * e.focusX,
    vy = height * crop.y + (height * crop.h - viewHeight) * e.focusY,
    radius = Math.min(e.radius, e.w / 2, e.h / 2);
  if (e.pixelate === 0) {
    // Image placed directly inside the viewport clip: resvg neither rasterizes a
    // filter around a nested <svg>, nor covers the viewport once a zoomed
    // viewBox no longer matches its aspect (empty band on one side).
    const scale =
      e.fit === "cover"
        ? Math.max(e.w / viewWidth, e.h / viewHeight)
        : Math.min(e.w / viewWidth, e.h / viewHeight);
    const x = (e.w - viewWidth * scale) / 2 - vx * scale;
    const y = (e.h - viewHeight * scale) / 2 - vy * scale;
    // Zone du filtre limitée au cadre visible : relative à une image agrandie
    // (cover, zoom), elle devient immense et resvg la tronque (bord vide).
    const margin = Math.ceil((e.blur ?? 0) * 3);
    // Sous une opacité (fondu), resvg tronque aussi une image plus large que
    // le cadre : un filtre neutre limité au cadre fixe la taille du calque.
    const fading = e.opacity < 1 || (e.keyframes.opacity?.length ?? 0) > 0;
    const filter =
      (e.blur ?? 0) > 0
        ? `<filter id="image-blur-${e.id}" filterUnits="userSpaceOnUse" x="${-margin}" y="${-margin}" width="${e.w + 2 * margin}" height="${e.h + 2 * margin}"><feGaussianBlur stdDeviation="${e.blur}"/></filter>`
        : fading
          ? `<filter id="image-blur-${e.id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${e.w}" height="${e.h}"><feOffset dx="0" dy="0"/></filter>`
          : "";
    return `<defs><clipPath id="image-clip-${e.id}"><rect width="${e.w}" height="${e.h}" rx="${radius}" ry="${radius}"/></clipPath>${filter}</defs><g clip-path="url(#image-clip-${e.id})"><image href="data:${asset.mime};base64,${asset.data}" x="${x}" y="${y}" width="${width * scale}" height="${height * scale}" preserveAspectRatio="none"${filter ? ` filter="url(#image-blur-${e.id})"` : ""}/></g>`;
  }
  return `<defs><clipPath id="image-clip-${e.id}"><rect width="${e.w}" height="${e.h}" rx="${radius}" ry="${radius}"/></clipPath></defs><g clip-path="url(#image-clip-${e.id})"><svg width="${e.w}" height="${e.h}" viewBox="${vx} ${vy} ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid ${e.fit === "cover" ? "slice" : "meet"}">${content}</svg></g>`;
}
