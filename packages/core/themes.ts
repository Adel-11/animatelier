import { z } from "zod";
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const themeSchema = z
  .object({
    background: color,
    panel: color,
    track: color,
    text: color,
    muted: color,
    accent: color,
    answer: color,
    levels: z.array(color).min(1).max(10),
    backdrop: z
      .object({
        type: z.enum(["solid", "linear", "pattern"]),
        color: color,
        color2: color.optional(),
        angle: z.number().min(-360).max(360).optional(),
        spacing: z.number().min(4).max(500).optional(),
      })
      .strict()
      .optional(),
    logo: z
      .object({
        src: z.string().regex(/^(asset:[a-zA-Z0-9_-]+|file:[^\\:]+)$/),
        placement: z
          .enum(["top-left", "top-right", "bottom-left", "bottom-right"])
          .default("top-right"),
        size: z.number().min(16).max(600).default(100),
        margin: z.number().min(0).max(300).default(48),
        marginX: z.number().min(0).max(500).optional(),
        marginY: z.number().min(0).max(500).optional(),
        scenes: z
          .array(z.enum(["intro", "level", "question", "outro"]))
          .default(["level", "question", "outro"]),
        introSize: z.number().min(16).max(1080).default(700),
        introSeconds: z.number().min(1).max(30).default(3),
        fade: z.number().min(0).max(1).default(0.3),
      })
      .strict()
      .nullable(),
    typography: z
      .object({
        family: z.enum(["DejaVu Sans", "DejaVu Sans Mono"]),
        scale: z.number().min(0.5).max(2),
        bold: z.boolean(),
      })
      .strict(),
    shapes: z
      .object({
        radius: z.number().min(0).max(200),
        ringWidth: z.number().min(1).max(60),
      })
      .strict(),
  })
  .strict();
export type QuizTheme = z.infer<typeof themeSchema>;
const defaults: QuizTheme = {
  background: "#10182f",
  panel: "#202d49",
  track: "#344566",
  text: "#f5f7ff",
  muted: "#B7C3E6",
  accent: "#e7bd65",
  answer: "#237c63",
  levels: ["#3DDC97", "#FF8A3D", "#FF4D6D"],
  logo: null,
  typography: { family: "DejaVu Sans", scale: 1, bold: true },
  shapes: { radius: 24, ringWidth: 14 },
};
export const builtinThemes: Record<string, QuizTheme> = {
  default: defaults,
  light: {
    ...defaults,
    background: "#F5F7FA",
    panel: "#FFFFFF",
    track: "#D8DFEA",
    text: "#15243D",
    muted: "#526580",
    accent: "#6941C6",
    answer: "#16815D",
    levels: ["#16815D", "#BF5518", "#C12F59"],
  },
  qff: {
    ...defaults,
    background: "#07275F",
    panel: "#0F3678",
    track: "#1B478F",
    text: "#FDF8E3",
    muted: "#B7C3E6",
    accent: "#FECD1B",
    answer: "#3DDC97",
    shapes: { radius: 36, ringWidth: 22 },
    logo: {
      src: "file:brands/qff/logo.png",
      placement: "top-left",
      size: 190,
      margin: 50,
      marginX: 50,
      marginY: 165,
      scenes: ["intro", "level", "question", "outro"],
      introSize: 860,
      introSeconds: 3,
      fade: 0.3,
    },
  },
};
export const themeInputSchema = z.union([
  z.enum(["default", "light", "qff"]),
  themeSchema
    .deepPartial()
    .extend({
      extends: z.enum(["default", "light", "qff"]).optional(),
      correct: color.optional(),
    })
    .strict(),
]);
export function resolveTheme(
  input: unknown = "default",
  base?: unknown,
): QuizTheme {
  const parsed = themeInputSchema.parse(input);
  if (typeof parsed === "string")
    return themeSchema.parse(builtinThemes[parsed]);
  const parent = base
    ? resolveTheme(base)
    : builtinThemes[parsed.extends ?? "default"];
  const { extends: _, correct, ...overrides } = parsed;
  return themeSchema.parse({
    ...parent,
    ...overrides,
    ...(correct ? { answer: correct } : {}),
    typography: { ...parent.typography, ...parsed.typography },
    shapes: { ...parent.shapes, ...parsed.shapes },
    ...(parsed.logo ? { logo: { ...parent.logo, ...parsed.logo } } : {}),
  });
}
