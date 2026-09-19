import type { Actor, Project } from "./schema";
import { animated, transformBounds } from "./keyframes";
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
  const raw = a;
  a = animated(a, time, { ...transformBounds, moveX: [-1000, 1000] });
  const clip = a.timeline.find(
    (c) =>
      time >= c.start && (time < c.end || (time === a.end && c.end === a.end)),
  );
  const action = clip?.action ?? a.action;
  const dialogue = clip ? clip.dialogue : a.dialogue;
  const t = Math.max(0, time - (clip?.start ?? a.start));
  let x = a.x + a.moveX * clamp((time - a.start) / (a.end - a.start), 0, 1);
  if (a.timeline.some((c) => c.toX !== undefined)) {
    x = raw.x;
    for (const segment of a.timeline) {
      if (segment.toX === undefined) continue;
      if (time < segment.start) break;
      x +=
        (segment.toX - x) *
        clamp((time - segment.start) / (segment.end - segment.start), 0, 1);
      if (time < segment.end) break;
    }
    x += a.x - raw.x;
  }
  if (a.keyframes.x) x = a.x;
  const phase = t * Math.PI * 3;
  return {
    visible: time >= a.start && time <= a.end,
    x,
    action,
    dialogue: time >= a.start && time <= a.end ? dialogue : "",
    y: a.y,
    rotation: a.rotation,
    scale: a.scale,
    opacity: a.opacity,
    z: a.z,
    anchor: a.anchor,
    bob:
      action === "walk" ? Math.abs(Math.sin(phase)) * 7 : Math.sin(t * 2) * 2,
    leftArm:
      action === "walk"
        ? Math.sin(phase) * 28
        : action === "celebrate"
          ? 145 + Math.sin(phase) * 12
          : action === "hold"
            ? 65
            : -9,
    rightArm:
      action === "wave"
        ? -135 + Math.sin(phase) * 20
        : action === "celebrate"
          ? -145 - Math.sin(phase) * 12
          : action === "walk"
            ? -Math.sin(phase) * 28
            : action === "hold"
              ? -65
              : action === "point"
                ? -90
                : 9,
    leftLeg: action === "walk" ? -Math.sin(phase) * 24 : 0,
    rightLeg: action === "walk" ? Math.sin(phase) * 24 : 0,
    mouth:
      action === "talk" || (clip && dialogue)
        ? 3 + Math.abs(Math.sin(t * 12)) * 7
        : 3,
  };
}
