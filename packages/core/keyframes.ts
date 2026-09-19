import { z } from "zod";

export const easings = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "step",
] as const;
export const keyframeSchema = z
  .object({
    t: z.number().finite().min(0).max(120),
    v: z.number().finite(),
    ease: z.enum(easings).optional(),
  })
  .strict();
export const keyframesSchema = z
  .record(z.array(keyframeSchema).min(1).max(120))
  .default({});
export type Keyframes = z.infer<typeof keyframesSchema>;
export type Bounds = Record<string, readonly [number, number]>;
export const transformBounds: Bounds = {
  x: [-10000, 10000],
  y: [-10000, 10000],
  rotation: [-36000, 36000],
  scale: [0, 10],
  opacity: [0, 1],
  z: [-1000, 1000],
};
export function validateTracks(
  tracks: Keyframes,
  bounds: Bounds,
  ctx: z.RefinementCtx,
) {
  for (const [property, keys] of Object.entries(tracks)) {
    const range = Object.hasOwn(bounds, property)
      ? bounds[property]
      : undefined;
    if (!range) {
      ctx.addIssue({
        code: "custom",
        path: ["keyframes", property],
        message: `Propriété non animable : ${property}`,
      });
      continue;
    }
    keys.forEach((key, i) => {
      if (key.v < range[0] || key.v > range[1])
        ctx.addIssue({
          code: "custom",
          path: ["keyframes", property, i, "v"],
          message: `Valeur attendue entre ${range[0]} et ${range[1]}.`,
        });
      if (i && key.t <= keys[i - 1].t)
        ctx.addIssue({
          code: "custom",
          path: ["keyframes", property, i, "t"],
          message: "Les temps des clés doivent être strictement croissants.",
        });
    });
  }
}
export function interpolate(keys: Keyframes[string], time: number) {
  if (time <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1],
      b = keys[i];
    if (time >= b.t) continue;
    const p = (time - a.t) / (b.t - a.t);
    const ease = b.ease ?? "linear";
    const u =
      ease === "step"
        ? 0
        : ease === "easeIn"
          ? p * p
          : ease === "easeOut"
            ? 1 - (1 - p) ** 2
            : ease === "easeInOut"
              ? p < 0.5
                ? 2 * p * p
                : 1 - (-2 * p + 2) ** 2 / 2
              : p;
    return a.v + (b.v - a.v) * u;
  }
  return keys[keys.length - 1].v;
}
export function animated<T extends { keyframes: Keyframes }>(
  value: T,
  time: number,
): T {
  if (!Number.isFinite(time)) throw new Error("Temps invalide.");
  const result = { ...value };
  for (const [property, keys] of Object.entries(value.keyframes))
    (result as Record<string, unknown>)[property] = interpolate(keys, time);
  return result;
}
