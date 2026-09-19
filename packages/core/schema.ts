import { z } from "zod";
import { elementsSchema, flattenElements, transformShape } from "./elements";
import { transformBounds, validateTracks, validateWobble } from "./keyframes";

export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const actions = [
  "idle",
  "wave",
  "walk",
  "talk",
  "celebrate",
  "hold",
  "point",
] as const;
export const backgrounds = ["studio", "office", "park", "night"] as const;
export const actionClipSchema = z
  .object({
    start: z.number().finite().min(0).max(120),
    end: z.number().finite().min(0).max(120),
    action: z.enum(actions),
    dialogue: z.string().max(240).default(""),
    toX: z.number().finite().min(-10000).max(10000).optional(),
  })
  .strict();
export const actorSchema = z
  .object({
    id,
    name: z.string().min(1).max(80),
    ...transformShape,
    color,
    skin: color,
    action: z.enum(actions),
    timeline: z.array(actionClipSchema).max(100).default([]),
    start: z.number().min(0).max(120),
    end: z.number().min(0.1).max(120),
    moveX: z.number().min(-1000).max(1000),
    dialogue: z.string().max(240),
    flip: z.boolean(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.end <= a.start)
      ctx.addIssue({ code: "custom", message: "La fin doit suivre le début." });
    a.timeline.forEach((clip, i) => {
      if (
        clip.end <= clip.start ||
        clip.start < a.start ||
        clip.end > a.end ||
        (i > 0 && clip.start < a.timeline[i - 1].end)
      )
        ctx.addIssue({
          code: "custom",
          path: ["timeline", i],
          message:
            "Segments triés, sans chevauchement, de durée positive et compris dans la présence du personnage.",
        });
    });
    validateWobble(a.wobble, { ...transformBounds, moveX: [-1000, 1000] }, ctx);
    validateTracks(
      a.keyframes,
      { ...transformBounds, moveX: [-1000, 1000] },
      ctx,
    );
  });
export const sceneSchema = z
  .object({
    id,
    name: z.string().min(1).max(80),
    duration: z.number().min(1).max(120),
    background: z.enum(backgrounds),
    title: z.string().max(120),
    actors: z.array(actorSchema).max(40),
    elements: elementsSchema,
  })
  .strict()
  .superRefine((s, ctx) => {
    const elements = flattenElements(s.elements);
    for (const element of elements)
      if (element.attachment) {
        if (!s.elements.includes(element))
          ctx.addIssue({
            code: "custom",
            message: `${element.id} : attache réservée aux éléments racines.`,
          });
        if (!s.actors.some((a) => a.id === element.attachment!.actorId))
          ctx.addIssue({
            code: "custom",
            message: `${element.id} : personnage attaché introuvable.`,
          });
      }
    const nodes = [...s.actors, ...elements];
    if (new Set(nodes.map((a) => a.id)).size !== nodes.length)
      ctx.addIssue({
        code: "custom",
        message: "Identifiants de personnages ou éléments dupliqués.",
      });
    for (const node of nodes) {
      if (node.end > s.duration)
        ctx.addIssue({
          code: "custom",
          message: `${node.id} dépasse la durée de scène.`,
        });
      for (const [property, keys] of Object.entries(node.keyframes))
        if (keys.some((key) => key.t > s.duration))
          ctx.addIssue({
            code: "custom",
            message: `${node.id} : piste ${property} au-delà de la durée de scène.`,
          });
    }
  });
export const projectSchema = z
  .object({
    schemaVersion: z.literal(2),
    id,
    name: z.string().min(1).max(100),
    width: z.literal(1280),
    height: z.literal(720),
    fps: z.literal(30),
    scenes: z.array(sceneSchema).min(1).max(30),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (new Set(p.scenes.map((s) => s.id)).size !== p.scenes.length)
      ctx.addIssue({
        code: "custom",
        message: "Identifiants de scènes dupliqués.",
      });
  });
export type Actor = z.infer<typeof actorSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Project = z.infer<typeof projectSchema>;
export function parseProject(input: unknown): Project {
  if (
    input &&
    typeof input === "object" &&
    "schemaVersion" in input &&
    input.schemaVersion === 1
  )
    throw new Error(
      "Projet v1 non pris en charge. Créez un projet au format v2.",
    );
  return projectSchema.parse(input);
}
export function uid(prefix = "item") {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
export function newActor(
  duration: number,
  overrides: Partial<Actor> = {},
): Actor {
  return actorSchema.parse({
    id: uid("actor"),
    name: "Camille",
    x: 480,
    y: 565,
    scale: 1,
    color: "#8777ee",
    skin: "#eab894",
    action: "wave",
    start: 0,
    end: duration,
    moveX: 0,
    dialogue: "",
    flip: false,
    ...overrides,
  });
}
export function demoProject(): Project {
  return parseProject({
    schemaVersion: 2,
    id: uid("project"),
    name: "Une idée prend vie",
    width: 1280,
    height: 720,
    fps: 30,
    scenes: [
      {
        id: uid("scene"),
        name: "La rencontre",
        duration: 8,
        background: "studio",
        title: "Les grandes idées commencent ici.",
        actors: [
          newActor(8, {
            name: "Camille",
            x: 470,
            dialogue: "Et si on créait ensemble ?",
          }),
          newActor(8, {
            name: "Alex",
            x: 810,
            color: "#e99658",
            skin: "#9c674d",
            action: "talk",
            flip: true,
          }),
        ],
      },
    ],
  });
}
