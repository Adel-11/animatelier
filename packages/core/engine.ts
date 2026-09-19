import type { Actor, Project } from "./schema";
import { animated } from "./keyframes";
export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
export function locateTime(project: Project, time: number) {
  if (!Number.isFinite(time)) throw new Error("Temps invalide.");
  let remaining = clamp(time, 0, totalDuration(project));
  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    if (remaining < scene.duration || i === project.scenes.length - 1)
      return { scene, time: remaining, index: i };
    remaining -= scene.duration;
  }
  throw new Error("Projet sans scène.");
}
export const totalDuration = (p: Project) =>
  p.scenes.reduce((n, s) => n + s.duration, 0);
export function poseAt(a: Actor, time: number) {
  a = animated(a, time);
  const t = Math.max(0, time - a.start);
  const phase = t * Math.PI * 3;
  return {
    visible: time >= a.start && time <= a.end,
    x: a.keyframes.x ? a.x : a.x + a.moveX * clamp(t / (a.end - a.start), 0, 1),
    y: a.y,
    rotation: a.rotation,
    scale: a.scale,
    opacity: a.opacity,
    z: a.z,
    anchor: a.anchor,
    bob:
      a.action === "walk" ? Math.abs(Math.sin(phase)) * 7 : Math.sin(t * 2) * 2,
    leftArm:
      a.action === "walk"
        ? Math.sin(phase) * 28
        : a.action === "celebrate"
          ? 145 + Math.sin(phase) * 12
          : -9,
    rightArm:
      a.action === "wave"
        ? -135 + Math.sin(phase) * 20
        : a.action === "celebrate"
          ? -145 - Math.sin(phase) * 12
          : a.action === "walk"
            ? -Math.sin(phase) * 28
            : 9,
    leftLeg: a.action === "walk" ? -Math.sin(phase) * 24 : 0,
    rightLeg: a.action === "walk" ? Math.sin(phase) * 24 : 0,
    mouth: a.action === "talk" ? 3 + Math.abs(Math.sin(t * 12)) * 7 : 3,
  };
}
