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
  return `<defs><clipPath id="image-clip-${e.id}"><rect width="${e.w}" height="${e.h}" rx="${radius}" ry="${radius}"/></clipPath></defs><g clip-path="url(#image-clip-${e.id})"><svg width="${e.w}" height="${e.h}" viewBox="${vx} ${vy} ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid ${e.fit === "cover" ? "slice" : "meet"}">${content}</svg></g>`;
}
