import { pathMetrics } from "../core/paths";
import type { Clip } from "../core/elements";
import type { ElementState } from "../core/element-state";
const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function renderElement(state: ElementState, selected?: string): string {
  if (!state.visible) return "";
  const e = state.element;
  let content = "";
  if (e.type === "path" && e.draw > 0) {
    if (e.draw >= 1)
      content = `<path d="${esc(pathMetrics(e.d).d)}" fill="${e.fill}" stroke="${e.stroke}" stroke-width="${e.strokeWidth}"/>`;
    else {
      const metrics = pathMetrics(e.d);
      let remaining = metrics.length * e.draw;
      content = metrics.parts
        .map((part) => {
          const visible = Math.min(part.length, Math.max(0, remaining));
          remaining -= part.length;
          return visible > 0
            ? `<path d="${esc(part.d)}" fill="none" stroke="${e.stroke}" stroke-width="${e.strokeWidth}" stroke-dasharray="${part.length} ${part.length}" stroke-dashoffset="${part.length - visible}"/>`
            : "";
        })
        .join("");
    }
  }
  if (e.type === "rect")
    content = `<rect width="${e.w}" height="${e.h}" rx="${e.radius}" fill="${e.fill}" stroke="${e.stroke}" stroke-width="${e.strokeWidth}"/>`;
  if (e.type === "ellipse")
    content = `<ellipse cx="${e.w / 2}" cy="${e.h / 2}" rx="${e.w / 2}" ry="${e.h / 2}" fill="${e.fill}" stroke="${e.stroke}" stroke-width="${e.strokeWidth}"/>`;
  if (e.type === "line") {
    content = `<line x2="${e.x2}" y2="${e.y2}" stroke="${e.stroke}" stroke-width="${e.strokeWidth}"${e.dashed ? ' stroke-dasharray="10 7"' : ""}/>`;
    const angle = (Math.atan2(e.y2, e.x2) * 180) / Math.PI,
      size = Math.max(6, e.strokeWidth * 3);
    const arrow = (x: number, y: number, a: number) =>
      `<path d="M${-size} ${-size / 2} L0 0 L${-size} ${size / 2}" fill="none" stroke="${e.stroke}" stroke-width="${e.strokeWidth}" transform="translate(${x} ${y}) rotate(${a})"/>`;
    if (e.arrow === "start" || e.arrow === "both")
      content += arrow(0, 0, angle + 180);
    if (e.arrow === "end" || e.arrow === "both")
      content += arrow(e.x2, e.y2, angle);
  }
  if (e.type === "text")
    content = `<text fill="${e.color}" font-size="${e.fontSize}" text-anchor="${{ left: "start", center: "middle", right: "end" }[e.align]}" font-weight="${e.bold ? 700 : 400}">${(
      state.displayText ?? e.text
    )
      .split("\n")
      .map(
        (line, i) =>
          `<tspan x="0" dy="${i ? e.fontSize * 1.2 : 0}">${esc(line)}</tspan>`,
      )
      .join("")}</text>`;
  if (e.type === "group")
    content = [...state.children]
      .sort((a, b) => a.element.z - b.element.z)
      .map((child) => renderElement(child, selected))
      .join("");
  if (e.type === "group" && e.clip) {
    const serialized = JSON.stringify(e.clip);
    let hash = 2166136261;
    for (const c of serialized)
      hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    const clipId = `clip-${e.id}-${(hash >>> 0).toString(16)}`;
    content = `<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">${clipShape(e.clip)}</clipPath></defs><g clip-path="url(#${clipId})">${content}</g>`;
  }
  if (e.id === selected)
    content += `<circle cx="${e.anchor.x}" cy="${e.anchor.y}" r="7" fill="none" stroke="#7051d8" stroke-width="2"/><path d="M${e.anchor.x - 11} ${e.anchor.y}h22M${e.anchor.x} ${e.anchor.y - 11}v22" stroke="#7051d8" stroke-width="1"/>`;
  return `<g data-element-id="${esc(e.id)}" transform="matrix(${state.transform.join(" ")})" opacity="${e.opacity}">${content}</g>`;
}

function clipShape(clip: Clip) {
  if (clip.type === "path") return `<path d="${esc(pathMetrics(clip.d).d)}"/>`;
  if (clip.type === "ellipse")
    return `<ellipse cx="${clip.x + clip.w / 2}" cy="${clip.y + clip.h / 2}" rx="${clip.w / 2}" ry="${clip.h / 2}"/>`;
  return `<rect x="${clip.x}" y="${clip.y}" width="${clip.w}" height="${clip.h}" rx="${clip.radius}"/>`;
}
