import { z } from "zod";
import { newElement, type SceneElement } from "./elements";

const media = z.string().regex(/^(asset:[a-zA-Z0-9_-]+|file:[^\\:]+)$/);

/** Fond photo flou partagé par les modes liste (`stack`) et intrus (`odd`). */
export const photoBackgroundSchema = z
  .object({
    images: z.array(media).min(1).max(15),
    blur: z.number().finite().min(0).max(50).default(16),
    dim: z.number().finite().min(0).max(1).default(0.5),
    motion: z.enum(["in", "out", "pingpong"]).default("pingpong"),
    zoom: z.number().finite().min(1).max(2).default(1.12),
    // Durée du fondu enchaîné entre deux photos (0 : coupe franche).
    transition: z.number().finite().min(0).max(2).default(0.7),
  })
  .strict();
export type PhotoBackground = z.infer<typeof photoBackgroundSchema>;

type BackgroundScene = { duration: number; elements: SceneElement[] };
const frameStep = 1 / 30;
const round = (value: number) => Math.round(value * 10000) / 10000;

/**
 * Pose le fond sous chaque scène, après compilation des durées.
 * - Les scènes consécutives qui partagent une photo forment un seul plan :
 *   le zoom (Ken Burns) y est continu, sans saut d'une scène à l'autre.
 * - Au changement de photo, la précédente reste au-dessus et s'efface
 *   (`background_previous`) en poursuivant son mouvement.
 * - L'image déborde du cadre pour que le flou n'assombrisse jamais les bords.
 */
export function applyPhotoBackground(
  scenes: BackgroundScene[],
  sources: (string | undefined)[],
  bg: Pick<PhotoBackground, "blur" | "zoom" | "motion" | "transition">,
  width: number,
  height: number,
) {
  const bleed = Math.ceil(bg.blur * 3) + 24;
  const shots: { src: string; scenes: number[]; duration: number }[] = [];
  sources.forEach((src, index) => {
    const last = shots.at(-1);
    if (!src) return;
    if (last?.src === src && last.scenes.at(-1) === index - 1) {
      last.scenes.push(index);
      last.duration += scenes[index].duration;
    } else shots.push({ src, scenes: [index], duration: scenes[index].duration });
  });
  shots.forEach((shot, k) => {
    const next = shots[k + 1];
    const nextScene =
      next && next.scenes[0] === shot.scenes.at(-1)! + 1
        ? scenes[next.scenes[0]]
        : undefined;
    const tail = nextScene
      ? Math.max(0, Math.min(bg.transition, nextScene.duration - frameStep))
      : 0;
    const span = shot.duration + tail;
    const zoomIn = bg.motion === "in" || (bg.motion === "pingpong" && k % 2 === 0);
    const zoomAt = (t: number) => {
      const u = span > 0 ? Math.min(1, Math.max(0, t / span)) : 0;
      return round(zoomIn ? 1 + (bg.zoom - 1) * u : bg.zoom - (bg.zoom - 1) * u);
    };
    const layer = (
      id: string,
      from: number,
      length: number,
      duration: number,
      opacity?: { t: number; v: number; ease?: "easeInOut" }[],
    ) =>
      newElement("image", duration, {
        id,
        src: shot.src,
        x: -bleed,
        y: -bleed,
        w: width + 2 * bleed,
        h: height + 2 * bleed,
        fit: "cover",
        blur: bg.blur,
        zoom: zoomAt(from),
        keyframes: {
          zoom: [
            { t: 0, v: zoomAt(from) },
            { t: length, v: zoomAt(from + length) },
          ],
          ...(opacity ? { opacity } : {}),
        },
      });
    // Le calque sortant est posé avant le plan suivant : ce dernier passe dessous.
    if (nextScene && tail > 0)
      nextScene.elements.unshift(
        layer("background_previous", shot.duration, tail, Math.min(nextScene.duration, tail + frameStep), [
          { t: 0, v: 1 },
          { t: tail, v: 0, ease: "easeInOut" },
        ]),
      );
    let offset = 0;
    for (const index of shot.scenes) {
      const duration = scenes[index].duration;
      scenes[index].elements.unshift(
        layer(
          "background_image",
          offset,
          Math.max(0, duration - frameStep),
          duration,
        ),
      );
      offset += duration;
    }
  });
}
