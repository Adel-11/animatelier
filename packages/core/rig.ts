import type { Actor } from "./schema";
import { poseAt } from "./engine";
import { multiply, transformMatrix, type Matrix } from "./element-state";

export function actorMatrix(actor: Actor, time: number): Matrix {
  const pose = poseAt(actor, time);
  return multiply(transformMatrix({ ...pose, y: pose.y - pose.bob }), [
    actor.flip ? -1 : 1,
    0,
    0,
    1,
    0,
    0,
  ]);
}
export function handMatrix(
  actor: Actor,
  time: number,
  hand: "left" | "right",
): Matrix {
  const pose = poseAt(actor, time);
  const angle =
    ((hand === "left" ? pose.leftArm : pose.rightArm) * Math.PI) / 180;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return multiply(actorMatrix(actor, time), [
    c,
    s,
    -s,
    c,
    (hand === "left" ? -37 : 37) - 85 * s,
    -197 + 85 * c,
  ]);
}
