import { z } from "zod";
import { newElement, identifier, type SceneElement } from "./elements";
import { parseProject, newActor, type Actor } from "./schema";
import { wrapText } from "./text";
import { resolveTheme, themeInputSchema } from "./themes";
import { spokenNumbers } from "./speech";
const label = z.string().trim().min(1).max(500);
const seconds = z.number().finite().min(1).max(30);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const say = z.string().trim().min(1).max(1000);
const extraElements = z
  .array(
    z
      .object({
        id: identifier,
        type: z.enum([
          "rect",
          "text",
          "image",
          "ellipse",
          "line",
          "path",
          "group",
        ]),
      })
      .passthrough(),
  )
  .max(100)
  .optional();
const extraActors = z
  .array(z.object({ id: identifier }).passthrough())
  .max(40)
  .optional();
const layoutSchema = z.record(
  z
    .object({
      visible: z.boolean().optional(),
      x: z.number().finite().min(-2).max(2).optional(),
      y: z.number().finite().min(-2).max(2).optional(),
      w: z.number().finite().min(0).max(2).optional(),
      h: z.number().finite().min(0).max(2).optional(),
      fontSize: z.number().min(1).max(400).optional(),
      radius: z.number().min(0).max(2500).optional(),
      fill: hex.optional(),
      color: hex.optional(),
      align: z.enum(["left", "center", "right"]).optional(),
      opacity: z.number().min(0).max(1).optional(),
    })
    .strict(),
);
const presenterSchema = z
  .object({
    name: label.default("Présentateur"),
    x: z.number().min(0).max(1).default(0.8),
    y: z.number().min(0).max(1).default(0.76),
    color: hex.default("#8777EE"),
    skin: hex.default("#EAB894"),
    scale: z.number().min(0.2).max(2).default(0.7),
    action: z
      .enum(["idle", "wave", "walk", "talk", "celebrate", "hold", "point"])
      .default("talk"),
    dialogue: z.enum(["question", "answer", "none"]).default("question"),
  })
  .strict();
// Card drawn behind an image so dark logos stay visible on dark backgrounds.
const imageCardSchema = z
  .object({
    color: hex,
    radius: z.number().min(0).max(500).optional(),
    padding: z.number().min(0).max(200).default(24),
    shape: z.enum(["square", "box"]).default("square"),
  })
  .strict();
const question = z
  .object({
    q: label,
    type: z
      .enum(["standard", "true-false", "odd-one-out", "estimate"])
      .default("standard"),
    a: label.optional(),
    choices: z.array(label).min(2).max(4).optional(),
    correctIndex: z.number().int().min(0).max(3).optional(),
    choicesLayout: z.enum(["grid", "list", "two", "overlay"]).default("grid"),
    hint: label.optional(),
    explanation: label.optional(),
    points: z.number().int().min(0).max(1000000).optional(),
    presenter: presenterSchema.nullable().optional(),
    image: z
      .string()
      .regex(/^(asset:[a-zA-Z0-9_-]+|file:[^\\:]+)$/)
      .optional(),
    imageEffect: z
      .union([
        z.enum(["blur", "pixelate", "zoom", "none"]),
        z
          .object({
            type: z.enum(["blur", "pixelate", "zoom"]),
            from: z.number().min(0).max(100),
            to: z.number().min(0).max(100),
            ease: z
              .enum(["linear", "easeIn", "easeOut", "easeInOut"])
              .default("linear"),
          })
          .strict()
          .superRefine((effect, ctx) => {
            const max =
              effect.type === "zoom" ? 10 : effect.type === "blur" ? 50 : 100;
            const min = effect.type === "zoom" ? 1 : 0;
            if (
              effect.from < min ||
              effect.to < min ||
              effect.from > max ||
              effect.to > max
            )
              ctx.addIssue({
                code: "custom",
                message: `Image effect ${effect.type} must stay within ${min}..${max}.`,
              });
          }),
      ])
      .default("none"),
    answerImage: z
      .string()
      .regex(/^(asset:[a-zA-Z0-9_-]+|file:[^\\:]+)$/)
      .optional(),
    focusX: z.number().min(0).max(1).default(0.5),
    focusY: z.number().min(0).max(1).default(0.5),
    crop: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        w: z.number().gt(0).max(1),
        h: z.number().gt(0).max(1),
      })
      .strict()
      .superRefine((crop, ctx) => {
        if (crop.x + crop.w > 1 + 1e-9 || crop.y + crop.h > 1 + 1e-9)
          ctx.addIssue({
            code: "custom",
            message: "Crop exceeds source image.",
          });
      })
      .optional(),
    imageCard: imageCardSchema.nullable().optional(),
    read: z.number().finite().min(0.5).max(30).optional(),
    say: say.optional(),
    sayAnswer: say.optional(),
    aSay: say.optional(),
    elements: extraElements,
    actors: extraActors,
    layout: layoutSchema.optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (
      q.choices
        ? q.correctIndex === undefined || q.correctIndex >= q.choices.length
        : !q.a
    )
      ctx.addIssue({
        code: "custom",
        message: "Provide answer a or choices with a valid correctIndex.",
      });
    if (!q.choices && q.correctIndex !== undefined)
      ctx.addIssue({
        code: "custom",
        message: "correctIndex requires choices.",
      });
    if (q.choicesLayout === "two" && q.choices?.length !== 2)
      ctx.addIssue({
        code: "custom",
        message: "choicesLayout two requires exactly two choices.",
      });
    if (q.type === "estimate" && (!q.a || !Number.isFinite(Number(q.a))))
      ctx.addIssue({
        code: "custom",
        message: "estimate requires a numeric answer a.",
      });
  });
export const levelsSchema = z
  .object({
    mode: z.literal("levels"),
    title: label.default("Quiz"),
    format: z.enum(["reel-9x16", "post-4x5", "landscape"]).default("reel-9x16"),
    theme: themeInputSchema.optional(),
    language: z.enum(["en", "fr"]).default("en"),
    labels: z
      .object({
        level: label.optional(),
        question: label.optional(),
        of: label.optional(),
        answer: label.optional(),
      })
      .strict()
      .optional(),
    presenter: presenterSchema.optional(),
    voice: z
      .object({
        offsets: z
          .object({
            intro: z.number().min(0).max(10).default(0.3),
            level: z.number().min(0).max(10).default(0),
            question: z.number().min(0).max(10).default(0),
            answer: z.number().min(0).max(10).default(0.1),
            outro: z.number().min(0).max(10).default(0),
          })
          .strict()
          .default({}),
        min: z.number().min(0).max(30).default(0),
        pad: z.number().min(0).max(10).default(0.3),
        seed: z.number().int().min(0).max(2147483647).default(0),
        answerTemplates: z.array(say).min(1).max(30).optional(),
        questionPrefixes: z.array(say).min(1).max(30).optional(),
        pronounce: z
          .record(z.string().min(1).max(100), z.string().min(1).max(100))
          .optional(),
      })
      .strict()
      .default({}),
    music: z
      .object({
        bpm: z.number().int().min(50).max(200).default(108),
        root: z.number().int().min(36).max(72).default(48),
        progression: z
          .array(z.number().int().min(-12).max(12))
          .min(1)
          .max(16)
          .default([0, 5, 9, 7]),
      })
      .strict()
      .optional(),
    layout: layoutSchema.optional(),
    intro: z
      .object({
        logoSeconds: seconds.optional(),
        title: label.default("QUIZ"),
        subtitle: label.default("LEVELS"),
        tagline: label.default("How far can you go?"),
        titleSeconds: seconds.default(3.5),
        say: say.optional(),
        elements: extraElements,
        actors: extraActors,
        layout: layoutSchema.optional(),
      })
      .strict()
      .default({}),
    levels: z
      .array(
        z
          .object({
            name: label,
            subtitle: label.optional(),
            say: say.optional(),
            elements: extraElements,
            actors: extraActors,
            layout: layoutSchema.optional(),
            questions: z.array(question).min(1).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    questionEffect: z.enum(["blur", "hide", "none"]).default("blur"),
    countdownStyle: z.enum(["ring", "bar", "digits"]).default("ring"),
    countdownPosition: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .strict()
      .optional(),
    imageLayout: z.enum(["compact", "hero"]).default("compact"),
    imageCard: imageCardSchema.optional(),
    timing: z
      .object({
        read: z
          .union([z.literal("auto"), z.literal("voice"), seconds])
          .default("auto"),
        // Defaults depend on the mode: 3.5/4.5 s (auto), 1/15 s (voice).
        readMin: z.number().finite().min(0.5).max(30).optional(),
        readMax: z.number().finite().min(0.5).max(30).optional(),
        readPad: z.number().finite().min(0).max(5).default(0.3),
        answerMin: seconds.default(1),
        countdown: z.number().int().min(1).max(10).default(4),
        answer: seconds.default(2.4),
        levelCard: seconds.default(2.2),
        outro: seconds.default(7),
        maxDuration: z.number().min(1).max(3600).default(180),
      })
      .strict()
      .default({}),
    outro: z
      .object({
        title: label.default("What's your score?"),
        tiers: z.array(label).max(10).default([]),
        cta: z.array(label).max(5).default(["Follow for more quizzes"]),
        say: say.optional(),
        elements: extraElements,
        actors: extraActors,
        layout: layoutSchema.optional(),
      })
      .strict()
      .default({}),
    sequence: z
      .array(
        z
          .object({
            after: z.string().min(1).max(100),
            id: identifier,
            duration: z.number().min(1).max(120),
            say: say.optional(),
            elements: extraElements,
            actors: extraActors,
          })
          .strict(),
      )
      .max(40)
      .optional(),
    assets: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.levels.reduce((n, l) => n + l.questions.length, 0) > 60)
      ctx.addIssue({ code: "custom", message: "Maximum 60 questions." });
    if (
      (s.timing.readMin ?? 0.5) > (s.timing.readMax ?? 30) ||
      s.timing.answerMin > s.timing.answer
    )
      ctx.addIssue({
        code: "custom",
        message: "Timing minimum exceeds maximum.",
      });
  });

// The supplied QFF generator uses this compact form without a mode or level names.
export function normalizeLevels(input: unknown): unknown {
  if (
    !input ||
    typeof input !== "object" ||
    !("levels" in input) ||
    !Array.isArray(input.levels)
  )
    return input;
  const raw = input as Record<string, unknown>;
  if (raw.mode !== undefined && raw.mode !== "levels") return input;
  if (input.levels.some((l) => !l || typeof l !== "object" || Array.isArray(l)))
    return input;
  const { id: _, name, preset, defaults, ...rest } = raw;
  if (preset !== undefined && preset !== "qff-reel")
    throw new Error(`Unknown preset: ${String(preset)}`);
  const names = ["ROOKIE", "MASTER", "GOAT"],
    subs = ["Warm-up time", "Getting harder...", "Only legends survive"];
  const count = input.levels.reduce(
    (n, l) => n + (l?.questions?.length ?? 0),
    0,
  );
  const normalized = {
    ...rest,
    mode: "levels",
    title: raw.title ?? name ?? "Quiz",
    theme:
      raw.theme ??
      (preset === "qff-reel" || raw.mode === undefined ? "qff" : undefined),
    intro:
      raw.intro ??
      (preset === "qff-reel" || raw.mode === undefined
        ? {
            title: `${count} QUESTIONS`,
            subtitle: `${input.levels.length} LEVELS`,
            tagline: "How far can you go?",
            logoSeconds: 3,
            titleSeconds: 3.5,
          }
        : undefined),
    outro:
      raw.outro ??
      (preset === "qff-reel" || raw.mode === undefined
        ? {
            title: "What's your score?",
            tiers: ["0-5 · ROOKIE", "6-10 · MASTER", "11-15 · GOAT"],
            cta: [
              "Drop it in the comments!",
              "Follow Quiz Factory Forever",
              "for more quizzes",
            ],
          }
        : undefined),
    levels: input.levels.map((l, i) => ({
      ...l,
      name:
        l.name ??
        (preset === "qff-reel" || raw.mode === undefined
          ? (names[i] ?? `LEVEL ${i + 1}`)
          : `LEVEL ${i + 1}`),
      subtitle:
        l.subtitle ??
        (preset === "qff-reel" || raw.mode === undefined ? subs[i] : undefined),
      questions: l.questions?.map((q: Record<string, unknown>, j: number) => {
        const { defaults: levelDefaults } = l;
        const merged = {
          ...(defaults && typeof defaults === "object" ? defaults : {}),
          ...(levelDefaults && typeof levelDefaults === "object"
            ? levelDefaults
            : {}),
          ...q,
        } as Record<string, unknown>;
        if (merged.type === "true-false") {
          if (
            merged.a !== "true" &&
            merged.a !== "false" &&
            merged.a !== "vrai" &&
            merged.a !== "faux"
          )
            throw new Error(
              `Question ${i + 1}.${j + 1}: true-false answer must be true/false or vrai/faux.`,
            );
          const french = raw.language === "fr";
          const correct = merged.a === "true" || merged.a === "vrai" ? 0 : 1;
          merged.choices = french ? ["Vrai", "Faux"] : ["True", "False"];
          merged.correctIndex = correct;
        }
        if (Array.isArray(merged.wrong)) {
          if (
            typeof merged.a !== "string" ||
            merged.choices !== undefined ||
            merged.correctIndex !== undefined
          )
            throw new Error(
              `Question ${i + 1}.${j + 1}: wrong requires a and no choices/correctIndex.`,
            );
          const wrong = merged.wrong as unknown[];
          const seed =
            typeof raw.voice === "object" &&
            raw.voice &&
            "seed" in raw.voice &&
            typeof raw.voice.seed === "number"
              ? raw.voice.seed
              : 0;
          const position =
            (Math.imul(seed + i * 101 + j * 31 + 1, 2654435761) >>> 0) %
            (wrong.length + 1);
          merged.choices = [
            ...wrong.slice(0, position),
            merged.a,
            ...wrong.slice(position),
          ];
          merged.correctIndex = position;
        }
        delete merged.wrong;
        return merged;
      }),
    })),
  };
  normalized.levels.forEach((level) => {
    delete (level as Record<string, unknown>).defaults;
  });
  return normalized;
}

export type QuizEvent = { time: number; type: string; id: string };
export type VoiceSlot = {
  id: string;
  start: number;
  maxDuration: number;
  text: string;
};
export const voiceDurationsSchema = z.record(
  z.string().regex(/^[a-z0-9_]{1,80}$/),
  z.number().finite().min(0).max(60),
);
export type CompileOptions = {
  voiceDurations?: Record<string, number>;
  protectVoiceClips?: boolean;
};
export function compileLevels(
  input: unknown,
  baseTheme?: unknown,
  options: CompileOptions = {},
) {
  const voiceConfigured =
    !!input && typeof input === "object" && "voice" in input;
  const s = levelsSchema.parse(normalizeLevels(input)),
    theme = resolveTheme(
      typeof s.theme === "object"
        ? s.theme
        : (baseTheme ?? s.theme ?? "default"),
      baseTheme,
    ),
    t = s.timing,
    fr = s.language === "fr";
  const [width, height] =
    s.format === "landscape"
      ? [1920, 1080]
      : s.format === "post-4x5"
        ? [1080, 1350]
        : [1080, 1920];
  const unit = width / 1080,
    safeH = s.format === "reel-9x16" ? height - 280 : height - 80;
  const all = s.levels.flatMap((l) => l.questions),
    warnings: string[] = [];
  const frame = (n: number) => Math.round(n * 30) / 30;
  const voiceMode = t.read === "voice",
    readMin = t.readMin ?? (voiceMode ? 1 : 3.5),
    readMax = t.readMax ?? (voiceMode ? 15 : 4.5);
  if (readMin > readMax)
    throw new Error("Timing minimum exceeds maximum (readMin > readMax).");
  const durations = options.voiceDurations
    ? voiceDurationsSchema.parse(options.voiceDurations)
    : undefined;
  if (voiceMode && !durations)
    throw new Error(
      'timing.read "voice" requires voice durations (--voice-durations voice-durations.json).',
    );
  const clampRead = (v: number) => Math.min(readMax, Math.max(readMin, v));
  const slotLength = (
    id: string,
    base: number,
    kind: keyof typeof s.voice.offsets,
  ) => {
    const recorded = durations?.[id];
    return recorded === undefined
      ? frame(base)
      : Math.ceil(
          Math.max(
            base,
            s.voice.min,
            recorded + s.voice.offsets[kind] + s.voice.pad,
          ) *
            30 -
            1e-6,
        ) / 30;
  };
  const autoRead = (q: { q: string }) =>
    clampRead(Math.round((2 + q.q.length / 20) * 2) / 2);
  // Reads fixed by the author (per question) or by the recorded voice are never shortened.
  const locked: boolean[] = [];
  const reads = all.map((q, i) => {
    const id = `question_${i + 1}`;
    if (q.read !== undefined) {
      locked.push(true);
      return frame(q.read);
    }
    if (voiceMode) {
      const d = durations![id];
      if (d === undefined) {
        warnings.push(`Voice duration missing for ${id}; using auto read.`);
        locked.push(false);
        return frame(autoRead(q));
      }
      const wanted = d + s.voice.offsets.question + t.readPad,
        v = options.protectVoiceClips
          ? Math.max(readMin, wanted)
          : clampRead(wanted);
      if (Math.abs(v - wanted) > 1e-9)
        warnings.push(
          `${id}: voice ${d.toFixed(2)}s + readPad gives ${wanted.toFixed(2)}s, clamped to ${v.toFixed(2)}s (readMin/readMax).`,
        );
      if (options.protectVoiceClips && wanted > readMax)
        warnings.push(
          `${id}: voice exceeds readMax ${readMax.toFixed(2)}s; preserving the full clip.`,
        );
      locked.push(true);
      // Round up so the countdown never starts before the voice has finished.
      return Math.ceil(v * 30 - 1e-6) / 30;
    }
    locked.push(false);
    return frame(typeof t.read === "number" ? t.read : autoRead(q));
  });
  let answer = frame(t.answer);
  const logoDuration = theme.logo
    ? frame(s.intro.logoSeconds ?? theme.logo.introSeconds)
    : 0;
  const titleDuration = slotLength("intro", s.intro.titleSeconds, "intro"),
    levelDurations = s.levels.map((_, i) =>
      slotLength(`level_${i + 1}`, t.levelCard, "level"),
    ),
    outroDuration = slotLength("outro", t.outro, "outro");
  const fixed =
    logoDuration +
    titleDuration +
    levelDurations.reduce((a, b) => a + b, 0) +
    outroDuration +
    all.length * t.countdown;
  let overflow =
    fixed +
    reads.reduce((a, b) => a + b, 0) +
    all.length * answer -
    t.maxDuration;
  if (overflow > 0) {
    const reduction = Math.min(answer - t.answerMin, overflow / all.length);
    answer = Math.ceil((answer - reduction) * 30) / 30;
    overflow =
      fixed +
      reads.reduce((a, b) => a + b, 0) +
      all.length * answer -
      t.maxDuration;
  }
  // Spend the remaining frame budget wherever reading can still be shortened.
  // A single equal-share pass strands capacity when a later question is already at its minimum.
  for (let i = 0; i < reads.length && overflow > 1e-8; i++) {
    if (locked[i]) continue;
    const reducibleFrames = Math.max(
      0,
      Math.floor((reads[i] - readMin) * 30 + 1e-8),
    );
    const frames = Math.min(reducibleFrames, Math.ceil(overflow * 30 - 1e-8));
    reads[i] = frame(reads[i] - frames / 30);
    overflow -= frames / 30;
  }
  if (overflow > 1 / 30)
    warnings.push(
      `Duration exceeds maxDuration by ${overflow.toFixed(2)}s after reducing answer then read to minimums.`,
    );
  const answerDurations = all.map((_, i) =>
    slotLength(`question_${i + 1}_answer`, answer, "answer"),
  );
  const answerExtension = answerDurations.reduce(
    (sum, duration) => sum + duration - answer,
    0,
  );
  const finalOverflow =
    fixed +
    reads.reduce((a, b) => a + b, 0) +
    all.length * answer +
    answerExtension -
    t.maxDuration;
  if (answerExtension > 0 && finalOverflow > 1 / 30)
    warnings.push(
      `Voice answer clips extend the video beyond maxDuration by ${finalOverflow.toFixed(2)}s.`,
    );
  const events: QuizEvent[] = [],
    voiceScript: VoiceSlot[] = [],
    layoutEntries: {
      scene: string;
      id: string;
      fontSize: number;
      lines: number;
      reduced: boolean;
      box: { x: number; y: number; w: number; h: number };
      reservedZone: boolean;
      start: number;
      end: number;
    }[] = [],
    questions: {
      id: string;
      start: number;
      readEnd: number;
      ticks: number[];
      reveal: number;
      end: number;
    }[] = [],
    levelCards: { id: string; start: number; end: number }[] = [],
    scenes: unknown[] = [];
  let now = 0,
    index = 0,
    currentScene = "";
  const voice = (
    id: string,
    start: number,
    maxDuration: number,
    text: string,
    custom?: string,
  ) => {
    // Author-supplied narration (say/sayAnswer) is kept verbatim.
    let spoken = custom ?? spokenNumbers(text, s.language);
    for (const [original, replacement] of Object.entries(
      s.voice.pronounce ?? {},
    ))
      spoken = spoken.split(original).join(replacement);
    const estimate = spoken.trim().split(/\s+/).length / 2.6;
    if (estimate > maxDuration + 0.25)
      warnings.push(
        `Voice slot ${id}: estimated ${estimate.toFixed(1)}s exceeds ${maxDuration.toFixed(1)}s; shorten text or adjust speech speed.`,
      );
    voiceScript.push({
      id,
      start: frame(start),
      maxDuration: frame(maxDuration),
      text: spoken,
    });
  };
  function scene(
    id: string,
    duration: number,
    kind: "intro" | "level" | "question" | "outro",
    draw: (api: ReturnType<typeof drawing>) => void,
  ) {
    duration = frame(duration);
    const d = drawing(duration);
    currentScene = id;
    draw(d);
    const questionNumber = /^question_(\d+)$/.exec(id)?.[1];
    const levelNumber = /^level_(\d+)$/.exec(id)?.[1];
    const additions =
      id === "intro"
        ? s.intro.elements
        : id === "outro"
          ? s.outro.elements
          : questionNumber
            ? all[Number(questionNumber) - 1]?.elements
            : levelNumber
              ? s.levels[Number(levelNumber) - 1]?.elements
              : undefined;
    for (const element of additions ?? [])
      d.elements.push(newElement(element.type, duration, element));
    if (theme.logo && id !== "intro_logo" && theme.logo.scenes.includes(kind)) {
      const l = theme.logo,
        size = l.size * unit,
        marginX = (l.marginX ?? l.margin) * unit,
        marginY = (l.marginY ?? l.margin) * (safeH / 1640);
      d.image(
        "brand_logo",
        l.src,
        l.placement.endsWith("right") ? width - marginX - size : marginX,
        l.placement.startsWith("bottom") ? safeH - size - marginY : marginY,
        size,
        size,
      );
    }
    const localLayout =
      id === "intro"
        ? s.intro.layout
        : id === "outro"
          ? s.outro.layout
          : questionNumber
            ? all[Number(questionNumber) - 1]?.layout
            : levelNumber
              ? s.levels[Number(levelNumber) - 1]?.layout
              : undefined;
    for (let i = 0; i < d.elements.length; i++) {
      const element = d.elements[i];
      const override: Record<string, unknown> = {};
      for (const source of [s.layout, localLayout])
        for (const [selector, values] of Object.entries(source ?? {}))
          if (
            selector === element.id ||
            (selector.endsWith("*") &&
              element.id.startsWith(selector.slice(0, -1)))
          )
            Object.assign(override, values);
      if (!Object.keys(override).length) continue;
      const { visible, x, y, w, h, ...style } = override;
      const position: Record<string, unknown> = { ...style };
      if (x !== undefined) position.x = Number(x) * width;
      if (y !== undefined) position.y = Number(y) * safeH;
      if (w !== undefined)
        position[element.type === "text" ? "maxWidth" : "w"] =
          Number(w) * width;
      if (h !== undefined) {
        if (element.type === "text")
          throw new Error(
            `layout ${element.id}: h is unsupported for text; use fontSize and w.`,
          );
        position.h = Number(h) * safeH;
      }
      if (visible === false) position.opacity = 0;
      d.elements[i] = newElement(element.type, duration, {
        ...element,
        ...position,
      });
      if (d.elements[i].type === "text") {
        const updated = d.elements[i] as Extract<
          SceneElement,
          { type: "text" }
        >;
        const entry = layoutEntries.find(
          (item) => item.scene === id && item.id === element.id,
        );
        if (entry) {
          entry.fontSize = updated.fontSize;
          if (w !== undefined) entry.box.w = Number(w) * width;
          if (x !== undefined)
            entry.box.x =
              updated.x -
              (updated.align === "center"
                ? entry.box.w / 2
                : updated.align === "right"
                  ? entry.box.w
                  : 0);
          if (y !== undefined) entry.box.y = updated.y - updated.fontSize;
          entry.reservedZone = entry.box.y + entry.box.h > safeH;
        }
      }
    }
    const presenter = questionNumber
      ? all[Number(questionNumber) - 1].presenter === null
        ? undefined
        : (all[Number(questionNumber) - 1].presenter ?? s.presenter)
      : undefined;
    const questionData = questionNumber
      ? questions[Number(questionNumber) - 1]
      : undefined;
    const spokenAnswer = questionNumber
      ? (all[Number(questionNumber) - 1].a ??
        all[Number(questionNumber) - 1].choices?.[
          all[Number(questionNumber) - 1].correctIndex ?? 0
        ] ??
        "")
      : "";
    const actors = presenter
      ? [
          newActor(duration, {
            id: "quiz_presenter",
            name: presenter.name,
            x: presenter.x * width,
            y: presenter.y * safeH,
            color: presenter.color,
            skin: presenter.skin,
            scale: presenter.scale,
            action: presenter.action,
            flip: presenter.x > 0.5,
            dialogue: "",
            timeline:
              presenter.dialogue === "question"
                ? [
                    {
                      start: 0,
                      end: duration,
                      action: presenter.action,
                      dialogue: all[Number(questionNumber) - 1].q.slice(0, 240),
                    },
                  ]
                : presenter.dialogue === "answer" && questionData
                  ? [
                      {
                        start: 0,
                        end: questionData.reveal - questionData.start,
                        action: "idle",
                        dialogue: "",
                      },
                      {
                        start: questionData.reveal - questionData.start,
                        end: duration,
                        action: presenter.action,
                        dialogue: spokenAnswer,
                      },
                    ]
                  : [],
          }),
        ]
      : [];
    const rawActors =
      id === "intro"
        ? s.intro.actors
        : id === "outro"
          ? s.outro.actors
          : questionNumber
            ? all[Number(questionNumber) - 1]?.actors
            : levelNumber
              ? s.levels[Number(levelNumber) - 1]?.actors
              : undefined;
    actors.push(
      ...(rawActors ?? []).map((actor) =>
        newActor(duration, actor as Partial<Actor>),
      ),
    );
    scenes.push({
      id,
      name: id,
      duration,
      background: "studio",
      backdrop: theme.backdrop ?? { type: "solid", color: theme.background },
      title: "",
      actors,
      elements: d.elements,
    });
    now = frame(now + duration);
    currentScene = "";
  }
  function drawing(duration: number) {
    const elements: SceneElement[] = [];
    const add = (type: SceneElement["type"], data: Record<string, unknown>) =>
      elements.push(newElement(type, duration, { x: 0, y: 0, ...data }));
    const rect = (
      id: string,
      x: number,
      y: number,
      w: number,
      h: number,
      fill = theme.panel,
      extra = {},
    ) =>
      add("rect", {
        id,
        x,
        y,
        w,
        h,
        fill,
        radius: theme.shapes.radius,
        ...extra,
      });
    const text = (
      id: string,
      value: string,
      x: number,
      y: number,
      w: number,
      h: number,
      size: number,
      color = theme.text,
      extra = {},
    ) => {
      const requested = Math.min(400, size * theme.typography.scale);
      let fs = requested,
        lines: string[] = [];
      for (; fs >= 12; fs--) {
        lines = wrapText(
          value,
          fs,
          w,
          theme.typography.family,
          theme.typography.bold,
        );
        if (lines.length * fs * 1.2 <= h) break;
      }
      if (fs < 12) {
        fs = 12;
        warnings.push(`Text overflow: ${id}: ${value}`);
      }
      add("text", {
        id,
        x: x + w / 2,
        y: y + (h - lines.length * fs * 1.2) / 2 + fs,
        align: "center",
        text: lines.join("\n"),
        fontSize: fs,
        bold: theme.typography.bold,
        color,
        ...extra,
      });
      layoutEntries.push({
        scene: currentScene,
        id,
        fontSize: fs,
        lines: lines.length,
        reduced: fs < requested,
        box: { x, y, w, h },
        reservedZone: y + h > safeH,
        start:
          typeof extra === "object" && extra && "start" in extra
            ? Number(extra.start)
            : 0,
        end:
          typeof extra === "object" && extra && "end" in extra
            ? Number(extra.end)
            : duration,
      });
    };
    const image = (
      id: string,
      src: string,
      x: number,
      y: number,
      w: number,
      h: number,
      extra = {},
    ) =>
      add("image" as SceneElement["type"], {
        id,
        src,
        x,
        y,
        w,
        h,
        fit: "contain",
        radius: theme.shapes.radius,
        ...extra,
      });
    return { elements, add, rect, text, image };
  }
  function progressBars(
    d: ReturnType<typeof drawing>,
    levelIndex: number,
    questionIndex: number,
    card = false,
    reveal = 0,
  ) {
    const margin = width * (50 / 1080),
      contentW = width - 2 * margin,
      groupW = contentW / s.levels.length,
      y = (safeH * 400) / 1640,
      labelY = (safeH * 430) / 1640;
    s.levels.forEach((level, i) => {
      const cellW = (groupW - 16) / level.questions.length;
      level.questions.forEach((_, j) => {
        const x = margin + i * groupW + j * cellW,
          common = [x, y, cellW - 4, 22 * unit] as const,
          active = i < levelIndex || (i === levelIndex && j <= questionIndex);
        d.rect(
          `${card ? "card_progress" : "progress"}_${i}_${j}`,
          ...common,
          card && i < levelIndex
            ? theme.levels[i % theme.levels.length]
            : theme.track,
          { radius: 11 * unit },
        );
        if (!card && active)
          d.rect(
            `progress_fill_${i}_${j}`,
            ...common,
            theme.levels[i % theme.levels.length],
            {
              radius: 11 * unit,
              ...(i === levelIndex && j === questionIndex
                ? { start: reveal }
                : {}),
            },
          );
      });
      d.text(
        `${card ? "card_progress_label" : "progress_label"}_${i}`,
        level.name,
        margin + i * groupW,
        labelY,
        groupW,
        48 * unit,
        28 * unit,
        theme.levels[i % theme.levels.length],
      );
    });
  }
  const introStart = now;
  if (logoDuration && theme.logo) {
    const l = theme.logo;
    scene("intro_logo", logoDuration, "intro", (d) => {
      const size = Math.min(l.introSize * unit, width * 0.85, safeH * 0.8);
      d.image(
        "cover_logo",
        l.src,
        (width - size) / 2,
        (height - size) / 2,
        size,
        size,
        {
          keyframes: l.fade
            ? {
                opacity: [
                  { t: 0, v: 0 },
                  { t: Math.min(l.fade, logoDuration / 2), v: 1 },
                ],
              }
            : {},
        },
      );
    });
  }
  const titleStart = now;
  scene("intro", titleDuration, "intro", (d) => {
    d.text(
      "intro_title",
      s.intro.title,
      width * 0.08,
      safeH * 0.26,
      width * 0.84,
      safeH * 0.1,
      90 * unit,
    );
    d.text(
      "intro_subtitle",
      s.intro.subtitle,
      width * 0.08,
      safeH * 0.37,
      width * 0.84,
      safeH * 0.1,
      75 * unit,
      theme.accent,
    );
    d.text(
      "intro_tagline",
      s.intro.tagline,
      width * 0.08,
      safeH * 0.78,
      width * 0.84,
      safeH * 0.1,
      48 * unit,
    );
    s.levels.forEach((l, i) => {
      const rowH = Math.min(104 * unit, (safeH * 0.28) / s.levels.length),
        y = safeH * 0.49 + i * rowH;
      d.rect(
        `badge_${i}`,
        width * 0.25,
        y,
        width * 0.5,
        rowH * 0.85,
        theme.levels[i % theme.levels.length],
      );
      d.text(
        `badge_text_${i}`,
        l.name,
        width * 0.27,
        y,
        width * 0.46,
        rowH * 0.85,
        50 * unit,
        theme.background,
      );
    });
  });
  voice(
    "intro",
    titleStart,
    titleDuration,
    `${s.intro.title}. ${s.intro.subtitle}. ${s.intro.tagline}`,
    s.intro.say,
  );
  const intro = { start: introStart, end: now };
  events.push({ time: introStart, type: "intro", id: "intro" });
  s.levels.forEach((level, li) => {
    const levelColor = theme.levels[li % theme.levels.length],
      ls = now,
      lid = `level_${li + 1}`;
    events.push({ time: ls, type: "level", id: lid });
    scene(lid, levelDurations[li], "level", (d) => {
      progressBars(d, li, -1, true);
      d.text(
        "level_number",
        `${s.labels?.level ?? (s.language === "fr" ? "NIVEAU" : "LEVEL")} ${li + 1}`,
        width * 0.08,
        safeH * 0.39,
        width * 0.84,
        safeH * 0.12,
        90 * unit,
      );

      d.text(
        "level_name",
        level.name,
        width * 0.08,
        safeH * 0.5,
        width * 0.84,
        safeH * 0.15,
        200 * unit,
        levelColor,
      );
      if (level.subtitle)
        d.text(
          "level_subtitle",
          level.subtitle,
          width * 0.08,
          safeH * 0.64,
          width * 0.84,
          safeH * 0.1,
          50 * unit,
          theme.muted,
        );
    });
    levelCards.push({ id: lid, start: ls, end: now });
    voice(
      lid,
      ls,
      levelDurations[li],
      `${s.labels?.level ?? (s.language === "fr" ? "Niveau" : "Level")} ${li + 1}. ${level.name}. ${level.subtitle ?? ""}`,
      level.say,
    );
    level.questions.forEach((q, qi) => {
      const number = ++index,
        id = `question_${number}`,
        start = now,
        read = reads[number - 1],
        reveal = frame(read + t.countdown),
        duration = frame(reveal + answerDurations[number - 1]),
        answerText = q.choices ? q.choices[q.correctIndex!] : q.a!;
      const ticks = Array.from({ length: t.countdown }, (_, i) =>
        frame(start + read + i),
      );
      questions.push({
        id,
        start,
        readEnd: frame(start + read),
        ticks,
        reveal: frame(start + reveal),
        end: frame(start + duration),
      });
      events.push(
        { time: start, type: "question", id },
        ...ticks.map((time) => ({ time, type: "tick", id })),
        { time: frame(start + reveal), type: "reveal", id },
      );
      const prefix =
        s.voice.questionPrefixes?.[
          (number - 1 + s.voice.seed) % s.voice.questionPrefixes.length
        ];
      const answerTemplate =
        s.voice.answerTemplates?.[
          (number - 1 + s.voice.seed) % s.voice.answerTemplates.length
        ];
      const spokenAnswer = q.aSay ?? spokenNumbers(answerText, s.language);
      voice(
        id,
        start,
        read,
        `Question ${number}. ${q.q}`,
        q.say ?? (voiceConfigured ? `${prefix ?? ""}${q.q}` : undefined),
      );
      voice(
        `${id}_answer`,
        start + reveal,
        answerDurations[number - 1],
        answerText,
        q.sayAnswer ??
          (answerTemplate
            ? answerTemplate.replaceAll("{a}", spokenAnswer)
            : q.aSay),
      );
      scene(id, duration, "question", (d) => {
        const landscape = s.format === "landscape",
          margin = width * (50 / 1080),
          contentW = width - 2 * margin,
          headerX = landscape ? margin : width * (300 / 1080),
          headerW = landscape ? contentW : width * (700 / 1080);
        d.rect(
          "level_badge_panel",
          headerX,
          safeH * (178 / 1640),
          headerW,
          84 * unit,
          levelColor,
        );
        d.text(
          "level_badge",
          `${s.labels?.level ?? (fr ? "NIVEAU" : "LEVEL")} ${li + 1} · ${level.name}`,
          headerX + 16,
          safeH * 0.1,
          headerW - 32,
          84 * unit,
          44 * unit,
          theme.background,
        );
        d.text(
          "question_number",
          `${s.labels?.question ?? "QUESTION"} ${number} ${s.labels?.of ?? (fr ? "SUR" : "OF")} ${all.length}`,
          headerX,
          safeH * 0.175,
          headerW,
          50 * unit,
          36 * unit,
          theme.muted,
        );
        progressBars(d, li, qi, false, reveal);
        // Layout: question panel, optional choice grid, then countdown/answer block.
        const hero =
            (s.imageLayout === "hero" || q.choicesLayout === "overlay") &&
            !!q.image,
          choiceColumns = q.choicesLayout === "list" ? 1 : 2,
          rows = q.choices ? Math.ceil(q.choices.length / choiceColumns) : 0,
          rowH = safeH * (q.choicesLayout === "list" ? 0.058 : 0.085),
          rowGap = safeH * 0.012,
          gridH = rows ? rows * rowH + (rows - 1) * rowGap : 0,
          gap = safeH * 0.015;
        let py: number, pw: number, ph: number;
        let ax: number, ay: number, aw: number, ah: number;
        let gridY = 0;
        if (landscape) {
          py = height * 0.39;
          pw = width * 0.54;
          ph = height * 0.43;
          ax = width * 0.64;
          ay = height * 0.64;
          aw = width * 0.3;
          ah = height * 0.23;
        } else if (hero) {
          py = safeH * 0.29;
          pw = contentW;
          ah = safeH * 0.135;
          ay = safeH * 0.995 - ah;
          if (rows) gridY = ay - gap - gridH;
          ph = (rows && q.choicesLayout !== "overlay" ? gridY : ay) - gap - py;
          ax = width * (110 / 1080);
          aw = width * (860 / 1080);
        } else {
          py = safeH * 0.323;
          pw = contentW;
          ph = safeH * (q.choices ? (q.image ? 0.25 : 0.19) : 0.305);
          ax = width * (110 / 1080);
          aw = width * (860 / 1080);
          if (rows) {
            gridY = py + ph + gap;
            ay = gridY + gridH + safeH * 0.02;
            ah = Math.min(safeH * 0.23, safeH * 0.995 - ay);
          } else {
            ay = safeH * 0.665;
            ah = safeH * 0.23;
          }
        }
        d.rect("question_panel", margin, py, pw, ph);
        const effect =
          s.questionEffect === "none"
            ? {}
            : {
                keyframes: {
                  [s.questionEffect === "hide" ? "opacity" : "blur"]: [
                    {
                      t: 0,
                      v: s.questionEffect === "hide" ? 1 : 0,
                      ease: "step",
                    },
                    {
                      t: read,
                      v: s.questionEffect === "hide" ? 0 : 16,
                      ease: "step",
                    },
                    {
                      t: reveal,
                      v: s.questionEffect === "hide" ? 1 : 0,
                      ease: "step",
                    },
                  ],
                },
              };
        const questionH = !q.image
          ? ph - 48
          : hero
            ? landscape
              ? ph * 0.16
              : 80 * unit
            : ph * 0.3;
        d.text(
          "question",
          q.q,
          margin + 28,
          py + (hero ? 16 : 24),
          pw - 56,
          questionH,
          (hero ? 56 : 70) * unit,
          theme.text,
          effect,
        );
        if (q.hint)
          d.text(
            "hint",
            q.hint,
            margin + 30,
            py + ph * 0.83,
            pw - 60,
            ph * 0.14,
            34 * unit,
            theme.muted,
            { end: reveal - 1 / 60 },
          );
        if (q.image) {
          const effectType =
            typeof q.imageEffect === "string"
              ? q.imageEffect
              : q.imageEffect.type;
          const prop =
              effectType === "zoom"
                ? "zoom"
                : effectType === "pixelate"
                  ? "pixelate"
                  : "blur",
            v = effectType === "zoom" ? 3 : effectType === "pixelate" ? 25 : 18;
          // Image box inside the panel, below the question.
          let bx = margin + 28,
            bw = pw - 56,
            by: number,
            bh: number;
          if (hero) {
            by = py + 16 + questionH + 12;
            bh = py + ph - 20 - by;
          } else {
            by = py + ph * 0.34;
            bh = ph * 0.62;
          }
          const card =
            q.imageCard === null ? undefined : (q.imageCard ?? s.imageCard);
          if (card) {
            if (card.shape === "square" && bw > bh) {
              bx += (bw - bh) / 2;
              bw = bh;
            }
            d.rect("question_image_card", bx, by, bw, bh, card.color, {
              radius: card.radius ?? theme.shapes.radius,
            });
            const pad = Math.min(card.padding * unit, bw / 4, bh / 4);
            bx += pad;
            by += pad;
            bw -= 2 * pad;
            bh -= 2 * pad;
          }
          d.image("question_image", q.image, bx, by, bw, bh, {
            focusX: q.focusX,
            focusY: q.focusY,
            crop: q.crop,
            ...(card ? { radius: 0 } : {}),
            ...(effectType === "none"
              ? {}
              : {
                  keyframes: {
                    [prop]: [
                      {
                        t: 0,
                        v:
                          typeof q.imageEffect === "string"
                            ? prop === "zoom"
                              ? 1
                              : 0
                            : q.imageEffect.from,
                        ease: "step",
                      },
                      {
                        t: read,
                        v:
                          typeof q.imageEffect === "string"
                            ? v
                            : q.imageEffect.from,
                        ease: "step",
                      },
                      {
                        t: reveal,
                        v:
                          typeof q.imageEffect === "string"
                            ? prop === "zoom"
                              ? 1
                              : 0
                            : q.imageEffect.to,
                        ease:
                          typeof q.imageEffect === "string"
                            ? "step"
                            : q.imageEffect.ease,
                      },
                    ],
                  },
                }),
          });
          if (q.answerImage)
            d.image("question_answer_image", q.answerImage, bx, by, bw, bh, {
              start: reveal,
              focusX: q.focusX,
              focusY: q.focusY,
              crop: q.crop,
              ...(card ? { radius: 0 } : {}),
            });
        }
        // Elements that end exactly when the next one starts would share a frame
        // (visibility is inclusive), so each one leaves half a frame early.
        const eps = 1 / 60;
        const rx = s.countdownPosition
            ? width * s.countdownPosition.x
            : landscape
              ? width * 0.79
              : width / 2,
          ry = s.countdownPosition
            ? safeH * s.countdownPosition.y
            : landscape
              ? height * 0.46
              : hero || rows
                ? ay + ah / 2
                : safeH * 0.787,
          r = landscape
            ? 65
            : hero || rows
              ? Math.min(150 * (safeH / 1640), ah / 2 - theme.shapes.ringWidth)
              : 150 * (safeH / 1640);
        if (s.countdownStyle === "ring")
          d.add("ellipse", {
            id: "countdown_ring",
            x: rx - r,
            y: ry - r,
            w: r * 2,
            h: r * 2,
            fill: "none",
            stroke: theme.track,
            strokeWidth: theme.shapes.ringWidth,
            start: read,
            end: reveal - eps,
          });
        // A generic path traces the ring once over the countdown; no template-specific renderer.
        if (s.countdownStyle === "ring")
          d.add("path", {
            id: "countdown_arc",
            x: 0,
            y: 0,
            d: `M ${rx} ${ry - r} A ${r} ${r} 0 1 1 ${rx - 0.01} ${ry - r}`,
            fill: "none",
            stroke: theme.accent,
            strokeWidth: theme.shapes.ringWidth,
            start: read,
            end: reveal - eps,
            keyframes: {
              draw: [
                { t: read, v: 1 },
                { t: reveal, v: 0 },
              ],
            },
          });
        if (s.countdownStyle === "bar")
          d.rect(
            "countdown_bar",
            rx - r,
            ry + r * 0.75,
            r * 2,
            Math.max(10, theme.shapes.ringWidth),
            theme.accent,
            {
              radius: Math.max(5, theme.shapes.ringWidth / 2),
              start: read,
              end: reveal - eps,
              keyframes: {
                w: [
                  { t: read, v: r * 2 },
                  { t: reveal, v: 0 },
                ],
              },
            },
          );
        for (let k = 0; k < t.countdown; k++)
          d.text(
            `count_${k}`,
            String(t.countdown - k),
            rx - r,
            ry - r,
            2 * r,
            2 * r,
            landscape ? 64 : Math.min(150, r),
            theme.text,
            { start: read + k, end: read + k + 1 - eps },
          );
        if (q.choices) {
          if (landscape) {
            const cy = height * 0.2,
              cw = width * 0.3;
            q.choices.forEach((choice, i) =>
              d.text(
                `choice_${i}`,
                `${"ABCD"[i]}. ${choice}`,
                width * 0.64,
                cy + i * height * 0.055,
                cw,
                height * 0.05,
                23 * unit,
                theme.muted,
              ),
            );
          } else {
            // Portrait: 2-column grid of readable choice cards; the correct one lights up at reveal.
            const cellW = (contentW - 16 * (choiceColumns - 1)) / choiceColumns;
            q.choices.forEach((choice, i) => {
              const x = margin + (i % choiceColumns) * (cellW + 16),
                y = gridY + Math.floor(i / choiceColumns) * (rowH + rowGap),
                correct = i === q.correctIndex;
              d.rect(`choice_panel_${i}`, x, y, cellW, rowH, theme.track);
              d.text(
                `choice_${i}`,
                `${"ABCD"[i]}. ${choice}`,
                x + 16,
                y + 6,
                cellW - 32,
                rowH - 12,
                56 * unit,
                theme.text,
              );
              if (correct) {
                d.rect(
                  `choice_correct_panel_${i}`,
                  x,
                  y,
                  cellW,
                  rowH,
                  levelColor,
                  {
                    start: reveal,
                  },
                );
                d.text(
                  `choice_correct_${i}`,
                  `${"ABCD"[i]}. ${choice}`,
                  x + 16,
                  y + 6,
                  cellW - 32,
                  rowH - 12,
                  56 * unit,
                  theme.background,
                  { start: reveal },
                );
              }
            });
          }
        }
        d.rect("answer_panel", ax, ay, aw, ah, levelColor, {
          start: reveal,
          radius: (theme.shapes.radius * 7) / 6,
        });
        d.text(
          "answer_label",
          s.labels?.answer ?? (fr ? "R\u00c9PONSE" : "ANSWER"),
          ax + 24,
          ay + 15,
          aw - 48,
          ah * 0.22,
          42 * unit,
          theme.background,
          { start: reveal },
        );
        d.text(
          "answer",
          answerText,
          ax + 24,
          ay + ah * 0.26,
          aw - 48,
          ah * (q.explanation ? 0.48 : 0.65),
          84 * unit,
          theme.background,
          {
            start: reveal,
            ...(q.type === "estimate"
              ? {
                  number: { from: 0, to: Number(answerText), decimals: 0 },
                  keyframes: {
                    progress: [
                      { t: reveal, v: 0 },
                      { t: duration, v: 1 },
                    ],
                  },
                }
              : {}),
          },
        );
        if (q.explanation)
          d.text(
            "explanation",
            q.explanation,
            ax + 24,
            ay + ah * 0.76,
            aw - 48,
            ah * 0.22,
            32 * unit,
            theme.background,
            { start: reveal },
          );
        if (q.points !== undefined)
          d.text(
            "points",
            `${q.points} pts`,
            margin + pw * 0.72,
            py + 12,
            pw * 0.24,
            48 * unit,
            28 * unit,
            theme.accent,
            { start: reveal },
          );
      });
    });
  });
  let outroStart = now;
  scene("outro", outroDuration, "outro", (d) => {
    d.text(
      "outro_title",
      s.outro.title,
      width * 0.08,
      safeH * 0.18,
      width * 0.84,
      safeH * 0.18,
      70 * unit,
      theme.accent,
    );
    s.outro.tiers.forEach((tier, i) => {
      const step = Math.min(
          135 * unit,
          (safeH * 0.3) / Math.max(1, s.outro.tiers.length),
        ),
        rowH = step * 0.77,
        y = safeH * 0.42 + i * step;
      d.rect(
        `outro_tier_panel_${i}`,
        width * 0.2,
        y,
        width * 0.6,
        rowH,
        theme.levels[i % theme.levels.length],
        { radius: rowH / 2 },
      );
      d.text(
        `outro_tier_${i}`,
        tier,
        width * 0.22,
        y,
        width * 0.56,
        rowH,
        54 * unit,
        theme.background,
      );
    });
    d.text(
      "outro_cta",
      s.outro.cta.join("\n"),
      width * 0.08,
      safeH * 0.72,
      width * 0.84,
      safeH * 0.15,
      44 * unit,
      theme.muted,
    );
  });
  voice(
    "outro",
    outroStart,
    outroDuration,
    `${s.outro.title}. ${s.outro.cta.join(". ")}`,
    s.outro.say,
  );
  events.push({ time: outroStart, type: "outro", id: "outro" });
  if (s.sequence?.length) {
    const oldStarts = new Map<string, number>();
    let cursor = 0;
    for (const entry of scenes as { id: string; duration: number }[]) {
      oldStarts.set(entry.id, cursor);
      cursor += entry.duration;
    }
    const sceneIds = new Set(oldStarts.keys());
    const additions = new Map<string, typeof s.sequence>();
    for (const custom of s.sequence) {
      if (
        sceneIds.has(custom.id) ||
        s.sequence.some((other) => other !== custom && other.id === custom.id)
      )
        throw new Error(`Duplicate custom scene id: ${custom.id}`);
      if (custom.after !== "start" && !sceneIds.has(custom.after))
        throw new Error(`Unknown sequence anchor: ${custom.after}`);
      additions.set(custom.after, [
        ...(additions.get(custom.after) ?? []),
        custom,
      ]);
    }
    const ordered: { id: string; duration: number; [key: string]: unknown }[] =
      [];
    const insert = (anchor: string) => {
      for (const custom of additions.get(anchor) ?? []) {
        const customDuration = frame(
          Math.max(
            custom.duration,
            durations?.[custom.id] === undefined
              ? 0
              : durations[custom.id] + s.voice.pad,
            s.voice.min,
          ),
        );
        ordered.push({
          id: custom.id,
          name: custom.id,
          duration: customDuration,
          background: "studio",
          backdrop: theme.backdrop ?? {
            type: "solid",
            color: theme.background,
          },
          title: "",
          actors: (custom.actors ?? []).map((actor) =>
            newActor(customDuration, actor as Partial<Actor>),
          ),
          elements: (custom.elements ?? []).map((element) =>
            newElement(element.type, customDuration, element),
          ),
        });
      }
    };
    insert("start");
    for (const entry of scenes as { id: string; duration: number }[]) {
      ordered.push(entry);
      insert(entry.id);
    }
    const shifts = new Map<string, number>();
    let position = 0;
    for (const entry of ordered) {
      if (oldStarts.has(entry.id))
        shifts.set(entry.id, frame(position - oldStarts.get(entry.id)!));
      else {
        const custom = s.sequence.find((item) => item.id === entry.id)!;
        events.push({ time: frame(position), type: "custom", id: entry.id });
        if (custom.say)
          voice(entry.id, position, entry.duration, custom.say, custom.say);
      }
      position = frame(position + entry.duration);
    }
    const delta = (id: string) => shifts.get(id) ?? 0;
    for (const event of events)
      if (event.type !== "custom")
        event.time = frame(
          event.time + delta(event.id === "intro" ? "intro" : event.id),
        );
    for (const slot of voiceScript)
      if (!s.sequence.some((item) => item.id === slot.id))
        slot.start = frame(
          slot.start +
            delta(slot.id.endsWith("_answer") ? slot.id.slice(0, -7) : slot.id),
        );
    for (const q of questions) {
      const d = delta(q.id);
      q.start = frame(q.start + d);
      q.readEnd = frame(q.readEnd + d);
      q.ticks = q.ticks.map((tick) => frame(tick + d));
      q.reveal = frame(q.reveal + d);
      q.end = frame(q.end + d);
    }
    for (const level of levelCards) {
      const d = delta(level.id);
      level.start = frame(level.start + d);
      level.end = frame(level.end + d);
    }
    intro.start = frame(
      intro.start +
        (shifts.has("intro_logo") ? delta("intro_logo") : delta("intro")),
    );
    intro.end = frame(intro.end + delta("intro"));
    outroStart = frame(outroStart + delta("outro"));
    scenes.splice(0, scenes.length, ...ordered);
    now = position;
  }
  const project = parseProject({
    schemaVersion: 2,
    id: "quiz_compiled",
    name: s.title,
    width,
    height,
    fontFamily: theme.typography.family,
    fps: 30,
    scenes,
    ...(s.assets ? { assets: s.assets } : {}),
  });
  return {
    ok: true as const,
    project,
    duration: now,
    schedule: questions.map((q, i) => ({
      sceneId: q.id,
      question: i + 1,
      start: q.start,
      reveal: q.reveal,
      end: q.end,
    })),
    warnings,
    layoutReport: layoutEntries.map((entry) => ({
      ...entry,
      overlaps: layoutEntries
        .filter((other) => {
          if (
            other.scene !== entry.scene ||
            other.id === entry.id ||
            other.start >= entry.end ||
            entry.start >= other.end
          )
            return false;
          const iw = Math.max(
            0,
            Math.min(entry.box.x + entry.box.w, other.box.x + other.box.w) -
              Math.max(entry.box.x, other.box.x),
          );
          const ih = Math.max(
            0,
            Math.min(entry.box.y + entry.box.h, other.box.y + other.box.h) -
              Math.max(entry.box.y, other.box.y),
          );
          return (
            iw * ih >
            0.1 * Math.min(entry.box.w * entry.box.h, other.box.w * other.box.h)
          );
        })
        .map((other) => other.id),
    })),
    timeline: {
      duration: now,
      events: events.sort((a, b) => a.time - b.time),
      questions,
      intro,
      levels: levelCards,
      outro: { start: outroStart, end: frame(outroStart + outroDuration) },
    },
    voiceScript,
  };
}
