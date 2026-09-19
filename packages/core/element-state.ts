import { animated } from "./keyframes";
import type { SceneElement } from "./elements";
export type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function transformMatrix(
  e: Pick<SceneElement, "x" | "y" | "rotation" | "scale" | "anchor">,
): Matrix {
  const angle = (e.rotation * Math.PI) / 180,
    c = Math.cos(angle) * e.scale,
    s = Math.sin(angle) * e.scale;
  return [
    c,
    s,
    -s,
    c,
    e.x + e.anchor.x - c * e.anchor.x + s * e.anchor.y,
    e.y + e.anchor.y - s * e.anchor.x - c * e.anchor.y,
  ];
}
export type ElementState = {
  element: SceneElement;
  transform: Matrix;
  worldTransform: Matrix;
  visible: boolean;
  effectiveOpacity: number;
  children: ElementState[];
};
export function elementStates(
  elements: SceneElement[],
  time: number,
  parent: Matrix = identity,
  parentVisible = true,
  parentOpacity = 1,
): ElementState[] {
  return elements.map((raw) => {
    const element = animated(raw, time),
      transform = transformMatrix(element),
      worldTransform = multiply(parent, transform);
    const visible =
      parentVisible && time >= element.start && time <= element.end;
    const effectiveOpacity = parentOpacity * element.opacity;
    return {
      element,
      transform,
      worldTransform,
      visible,
      effectiveOpacity,
      children:
        element.type === "group"
          ? elementStates(
              element.children,
              time,
              worldTransform,
              visible,
              effectiveOpacity,
            )
          : [],
    };
  });
}
