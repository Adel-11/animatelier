import { z } from "zod";
import { pathDataSchema } from "./paths";
import {
  keyframesSchema,
  transformBounds,
  validateTracks,
  type Keyframes,
  type Bounds,
} from "./keyframes";

export const elementTypes = [
  "rect",
  "ellipse",
  "line",
  "text",
  "group",
  "path",
] as const;
export const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const paint = z.union([
  z.string().regex(/^#[0-9a-fA-F]{6}$/),
  z.literal("none"),
]);
export const transformShape = {
  x: z.number().finite().min(-10000).max(10000).default(0),
  y: z.number().finite().min(-10000).max(10000).default(0),
  rotation: z.number().finite().min(-36000).max(36000).default(0),
  scale: z.number().finite().min(0).max(10).default(1),
  opacity: z.number().finite().min(0).max(1).default(1),
  z: z.number().finite().min(-1000).max(1000).default(0),
  anchor: z
    .object({
      x: z.number().finite().min(-10000).max(10000),
      y: z.number().finite().min(-10000).max(10000),
    })
    .strict()
    .default({ x: 0, y: 0 }),
  keyframes: keyframesSchema,
};
type Common = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
  z: number;
  anchor: { x: number; y: number };
  keyframes: Keyframes;
  start: number;
  end: number;
};
export const clipSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("rect"),
      x: z.number().min(-10000).max(10000).default(0),
      y: z.number().min(-10000).max(10000).default(0),
      w: z.number().min(0).max(5000),
      h: z.number().min(0).max(5000),
      radius: z.number().min(0).max(2500).default(0),
    })
    .strict(),
  z
    .object({
      type: z.literal("ellipse"),
      x: z.number().min(-10000).max(10000).default(0),
      y: z.number().min(-10000).max(10000).default(0),
      w: z.number().min(0).max(5000),
      h: z.number().min(0).max(5000),
    })
    .strict(),
  z.object({ type: z.literal("path"), d: pathDataSchema }).strict(),
]);
export type Clip = z.infer<typeof clipSchema>;
export type SceneElement = Common &
  (
    | {
        type: "rect";
        w: number;
        h: number;
        radius: number;
        fill: string;
        stroke: string;
        strokeWidth: number;
      }
    | {
        type: "ellipse";
        w: number;
        h: number;
        fill: string;
        stroke: string;
        strokeWidth: number;
      }
    | {
        type: "line";
        x2: number;
        y2: number;
        stroke: string;
        strokeWidth: number;
        dashed: boolean;
        arrow: "none" | "start" | "end" | "both";
      }
    | {
        type: "text";
        text: string;
        fontSize: number;
        color: string;
        align: "left" | "center" | "right";
        bold: boolean;
        progress: number;
        number?: { from: number; to: number; decimals: number };
      }
    | { type: "group"; children: SceneElement[]; clip?: Clip }
    | {
        type: "path";
        d: string;
        fill: string;
        stroke: string;
        strokeWidth: number;
        draw: number;
      }
  );
export const elementBounds: Record<SceneElement["type"], Bounds> = {
  rect: {
    ...transformBounds,
    w: [0, 5000],
    h: [0, 5000],
    radius: [0, 2500],
    strokeWidth: [0, 100],
  },
  ellipse: {
    ...transformBounds,
    w: [0, 5000],
    h: [0, 5000],
    strokeWidth: [0, 100],
  },
  line: {
    ...transformBounds,
    x2: [-10000, 10000],
    y2: [-10000, 10000],
    strokeWidth: [0, 100],
  },
  text: { ...transformBounds, fontSize: [1, 400], progress: [0, 1] },
  group: transformBounds,
  path: { ...transformBounds, draw: [0, 1], strokeWidth: [0, 100] },
};
const common = {
  id: identifier,
  ...transformShape,
  start: z.number().min(0).max(120).default(0),
  end: z.number().min(0.1).max(120),
};
const size = {
  w: z.number().min(0).max(5000).default(160),
  h: z.number().min(0).max(5000).default(100),
};
const style = {
  fill: paint.default("#8777ee"),
  stroke: paint.default("none"),
  strokeWidth: z.number().min(0).max(100).default(2),
};
const recursive: z.ZodType<SceneElement, z.ZodTypeDef, any> = z.lazy(() =>
  z
    .discriminatedUnion("type", [
      z
        .object({
          ...common,
          type: z.literal("path"),
          d: pathDataSchema.default("M0 100 C60 0 100 200 160 100"),
          fill: paint.default("none"),
          stroke: paint.default("#8777ee"),
          strokeWidth: style.strokeWidth,
          draw: z.number().min(0).max(1).default(1),
        })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("rect"),
          ...size,
          ...style,
          radius: z.number().min(0).max(2500).default(0),
        })
        .strict(),
      z
        .object({ ...common, type: z.literal("ellipse"), ...size, ...style })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("line"),
          x2: z.number().min(-10000).max(10000).default(160),
          y2: z.number().min(-10000).max(10000).default(0),
          stroke: paint.default("#303440"),
          strokeWidth: style.strokeWidth,
          dashed: z.boolean().default(false),
          arrow: z.enum(["none", "start", "end", "both"]).default("none"),
        })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("text"),
          text: z.string().max(2000).default("Votre texte"),
          fontSize: z.number().min(1).max(400).default(32),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .default("#303440"),
          align: z.enum(["left", "center", "right"]).default("left"),
          bold: z.boolean().default(false),
          progress: z.number().min(0).max(1).default(0),
          number: z
            .object({
              from: z.number().finite().min(-1e12).max(1e12),
              to: z.number().finite().min(-1e12).max(1e12),
              decimals: z.number().int().min(0).max(6).default(0),
            })
            .strict()
            .optional(),
        })
        .strict(),
      z
        .object({
          ...common,
          type: z.literal("group"),
          children: z.array(recursive).max(200).default([]),
          clip: clipSchema.optional(),
        })
        .strict(),
    ])
    .superRefine((element, ctx) => {
      if (element.end <= element.start)
        ctx.addIssue({
          code: "custom",
          message: "La fin doit suivre le début.",
        });
      validateTracks(element.keyframes, elementBounds[element.type], ctx);
    }),
);

// Bound the raw tree before invoking the recursive parser, including cyclic JS inputs.
export function boundedElements(value: unknown, ctx: z.RefinementCtx): unknown {
  if (!Array.isArray(value)) return value;
  const queue = value.map((node) => ({ node, depth: 1 }));
  let count = 0;
  while (queue.length) {
    const { node, depth } = queue.pop()!;
    if (++count > 200 || depth > 8) {
      ctx.addIssue({
        code: "custom",
        message: "Maximum 200 éléments et huit niveaux par scène.",
      });
      return z.NEVER;
    }
    if (node && typeof node === "object" && Array.isArray(node.children))
      for (const child of node.children)
        queue.push({ node: child, depth: depth + 1 });
  }
  return value;
}
export const elementsSchema = z.preprocess(
  boundedElements,
  z.array(recursive).max(200).default([]),
);
export const elementSchema = z.preprocess(
  (value, ctx) => (boundedElements([value], ctx) === z.NEVER ? z.NEVER : value),
  recursive,
);
export function newElement(
  type: SceneElement["type"],
  duration: number,
  overrides: Record<string, unknown> = {},
) {
  return elementSchema.parse({
    id: `element_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
    type,
    end: duration,
    x: 500,
    y: 350,
    ...overrides,
  });
}
export function flattenElements(elements: SceneElement[]): SceneElement[] {
  return elements.flatMap((element) => [
    element,
    ...(element.type === "group" ? flattenElements(element.children) : []),
  ]);
}
export function findElementContainer(
  elements: SceneElement[],
  id: string,
): SceneElement[] | undefined {
  if (elements.some((element) => element.id === id)) return elements;
  for (const element of elements)
    if (element.type === "group") {
      const found = findElementContainer(element.children, id);
      if (found) return found;
    }
}
