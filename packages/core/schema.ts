import { z } from "zod";

export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const actions = ["idle", "wave", "walk", "talk", "celebrate"] as const;
export const backgrounds = ["studio", "office", "park", "night"] as const;
export const actorSchema = z
  .object({
    id,
    name: z.string().min(1).max(80),
    x: z.number().min(0).max(1280),
    y: z.number().min(100).max(710),
    scale: z.number().min(0.3).max(2.5),
    color,
    skin: color,
    action: z.enum(actions),
    start: z.number().min(0).max(120),
    end: z.number().min(0.1).max(120),
    moveX: z.number().min(-1000).max(1000),
    dialogue: z.string().max(240),
    flip: z.boolean(),
  })
  .strict()
  .refine((a) => a.end > a.start, { message: "La fin doit suivre le début." });
export const sceneSchema = z
  .object({
    id,
    name: z.string().min(1).max(80),
    duration: z.number().min(1).max(120),
    background: z.enum(backgrounds),
    title: z.string().max(120),
    actors: z.array(actorSchema).max(40),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (new Set(s.actors.map((a) => a.id)).size !== s.actors.length)
      ctx.addIssue({
        code: "custom",
        message: "Identifiants de personnages dupliqués.",
      });
    if (s.actors.some((a) => a.end > s.duration))
      ctx.addIssue({
        code: "custom",
        message: "Un personnage dépasse la durée de scène.",
      });
  });
export const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
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
    schemaVersion: 1,
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
