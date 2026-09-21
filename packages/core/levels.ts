import { z } from "zod";
import { newElement, type SceneElement } from "./elements";
import { parseProject } from "./schema";
import { wrapText } from "./text";
import { resolveTheme, themeInputSchema } from "./themes";
import { spokenNumbers } from "./speech";
const label = z.string().trim().min(1).max(500);
const seconds = z.number().finite().min(1).max(30);
const question = z
  .object({
    q: label,
    a: label.optional(),
    choices: z.array(label).min(2).max(4).optional(),
    correctIndex: z.number().int().min(0).max(3).optional(),
    image: z
      .string()
      .regex(/^(asset:[a-zA-Z0-9_-]+|file:[^\\:]+)$/)
      .optional(),
    imageEffect: z.enum(["blur", "pixelate", "zoom", "none"]).default("none"),
    focusX: z.number().min(0).max(1).default(0.5),
    focusY: z.number().min(0).max(1).default(0.5),
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
  });
export const levelsSchema = z
  .object({
    mode: z.literal("levels"),
    title: label.default("Quiz"),
    format: z.enum(["reel-9x16", "post-4x5", "landscape"]).default("reel-9x16"),
    theme: themeInputSchema.optional(),
    language: z.enum(["en", "fr"]).default("en"),
    intro: z
      .object({
        logoSeconds: seconds.optional(),
        title: label.default("QUIZ"),
        subtitle: label.default("LEVELS"),
        tagline: label.default("How far can you go?"),
        titleSeconds: seconds.default(3.5),
      })
      .strict()
      .default({}),
    levels: z
      .array(
        z
          .object({
            name: label,
            subtitle: label.optional(),
            questions: z.array(question).min(1).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    questionEffect: z.enum(["blur", "hide", "none"]).default("blur"),
    timing: z
      .object({
        read: z.union([z.literal("auto"), seconds]).default("auto"),
        readMin: seconds.default(3.5),
        readMax: seconds.default(4.5),
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
      })
      .strict()
      .default({}),
    assets: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.levels.reduce((n, l) => n + l.questions.length, 0) > 60)
      ctx.addIssue({ code: "custom", message: "Maximum 60 questions." });
    if (
      s.timing.readMin > s.timing.readMax ||
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
  if (raw.mode !== undefined) return input;
  const { id: _, name, ...rest } = raw;
  const names = ["ROOKIE", "MASTER", "GOAT"],
    subs = ["Warm-up time", "Getting harder...", "Only legends survive"];
  const count = input.levels.reduce(
    (n, l) => n + (l?.questions?.length ?? 0),
    0,
  );
  return {
    ...rest,
    mode: "levels",
    title: name ?? "Quiz",
    theme: raw.theme ?? "qff",
    intro: raw.intro ?? {
      title: `${count} QUESTIONS`,
      subtitle: `${input.levels.length} LEVELS`,
      tagline: "How far can you go?",
      logoSeconds: 3,
      titleSeconds: 3.5,
    },
    outro: raw.outro ?? {
      title: "What's your score?",
      tiers: ["0-5 · ROOKIE", "6-10 · MASTER", "11-15 · GOAT"],
      cta: [
        "Drop it in the comments!",
        "Follow Quiz Factory Forever",
        "for more quizzes",
      ],
    },
    levels: input.levels.map((l, i) => ({
      ...l,
      name: l.name ?? names[i] ?? `LEVEL ${i + 1}`,
      subtitle: l.subtitle ?? subs[i],
    })),
  };
}

export type QuizEvent = { time: number; type: string; id: string };
export type VoiceSlot = {
  id: string;
  start: number;
  maxDuration: number;
  text: string;
};
export function compileLevels(input: unknown, baseTheme?: unknown) {
  const s = levelsSchema.parse(normalizeLevels(input)),
    theme = resolveTheme(
      typeof s.theme === "object"
        ? s.theme
        : (baseTheme ?? s.theme ?? "default"),
      baseTheme,
    ),
    t = s.timing;
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
  const reads = all.map((q) =>
    frame(
      t.read === "auto"
        ? Math.min(
            t.readMax,
            Math.max(t.readMin, Math.round((2 + q.q.length / 20) * 2) / 2),
          )
        : t.read,
    ),
  );
  let answer = frame(t.answer);
  const logoDuration = theme.logo
    ? frame(s.intro.logoSeconds ?? theme.logo.introSeconds)
    : 0;
  const fixed =
    logoDuration +
    frame(s.intro.titleSeconds) +
    s.levels.length * frame(t.levelCard) +
    frame(t.outro) +
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
  if (overflow > 0)
    for (let i = 0; i < reads.length; i++) {
      const reduction = Math.min(
        Math.max(0, reads[i] - t.readMin),
        overflow / (reads.length - i),
      );
      const previous = reads[i];
      reads[i] = Math.ceil((reads[i] - reduction) * 30) / 30;
      overflow -= previous - reads[i];
    }
  if (overflow > 1 / 30)
    warnings.push(
      `Duration exceeds maxDuration by ${overflow.toFixed(2)}s after reducing answer then read to minimums.`,
    );
  const events: QuizEvent[] = [],
    voiceScript: VoiceSlot[] = [],
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
    index = 0;
  const voice = (
    id: string,
    start: number,
    maxDuration: number,
    text: string,
  ) =>
    voiceScript.push({
      id,
      start: frame(start),
      maxDuration: frame(maxDuration),
      text: spokenNumbers(text, s.language),
    });
  function scene(
    id: string,
    duration: number,
    kind: "intro" | "level" | "question" | "outro",
    draw: (api: ReturnType<typeof drawing>) => void,
  ) {
    duration = frame(duration);
    const d = drawing(duration);
    draw(d);
    if (theme.logo && theme.logo.scenes.includes(kind)) {
      const l = theme.logo,
        size = l.size * unit,
        margin = l.margin * unit;
      d.image(
        "brand_logo",
        l.src,
        l.placement.endsWith("right") ? width - margin - size : margin,
        l.placement.startsWith("bottom") ? safeH - size - margin : margin,
        size,
        size,
      );
    }
    scenes.push({
      id,
      name: id,
      duration,
      background: "studio",
      backdrop: theme.backdrop ?? { type: "solid", color: theme.background },
      title: "",
      actors: [],
      elements: d.elements,
    });
    now = frame(now + duration);
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
      let fs = Math.min(400, size * theme.typography.scale),
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
  const introStart = now;
  if (logoDuration && theme.logo) {
    const l = theme.logo;
    scene("intro_logo", logoDuration, "intro", (d) => {
      const size = Math.min(l.introSize * unit, width * 0.85, safeH * 0.8);
      d.image(
        "cover_logo",
        l.src,
        (width - size) / 2,
        (safeH - size) / 2,
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
  scene("intro", s.intro.titleSeconds, "intro", (d) => {
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
    s.intro.titleSeconds,
    `${s.intro.title}. ${s.intro.subtitle}. ${s.intro.tagline}`,
  );
  const intro = { start: introStart, end: now };
  events.push({ time: introStart, type: "intro", id: "intro" });
  s.levels.forEach((level, li) => {
    const levelColor = theme.levels[li % theme.levels.length],
      ls = now,
      lid = `level_${li + 1}`;
    events.push({ time: ls, type: "level", id: lid });
    scene(lid, t.levelCard, "level", (d) => {
      d.text(
        "level_name",
        level.name,
        width * 0.08,
        safeH * 0.35,
        width * 0.84,
        safeH * 0.2,
        95 * unit,
        levelColor,
      );
      if (level.subtitle)
        d.text(
          "level_subtitle",
          level.subtitle,
          width * 0.08,
          safeH * 0.58,
          width * 0.84,
          safeH * 0.15,
          42 * unit,
          theme.muted,
        );
    });
    levelCards.push({ id: lid, start: ls, end: now });
    voice(
      lid,
      ls,
      t.levelCard,
      `${s.language === "fr" ? "Niveau" : "Level"} ${li + 1}. ${level.name}. ${level.subtitle ?? ""}`,
    );
    level.questions.forEach((q, qi) => {
      const number = ++index,
        id = `question_${number}`,
        start = now,
        read = reads[number - 1],
        reveal = frame(read + t.countdown),
        duration = frame(reveal + answer),
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
      voice(
        id,
        start,
        read,
        `${s.language === "fr" ? "Question" : "Question"} ${number}. ${q.q}`,
      );
      voice(`${id}_answer`, start + reveal, answer, answerText);
      scene(id, duration, "question", (d) => {
        const landscape = s.format === "landscape",
          margin = width * 0.06,
          contentW = width * 0.88;
        d.rect(
          "level_badge_panel",
          margin,
          safeH * 0.1,
          contentW,
          84 * unit,
          levelColor,
        );
        d.text(
          "level_badge",
          `LEVEL ${li + 1} · ${level.name}`,
          margin,
          safeH * 0.1,
          contentW,
          84 * unit,
          44 * unit,
          theme.background,
        );
        d.text(
          "question_number",
          `QUESTION ${number} OF ${all.length}`,
          margin,
          safeH * 0.175,
          contentW,
          50 * unit,
          36 * unit,
          theme.muted,
        );
        s.levels.forEach((l, i) => {
          d.text(
            `progress_label_${i}`,
            l.name,
            margin + (i * contentW) / s.levels.length,
            safeH * 0.263,
            contentW / s.levels.length,
            40 * unit,
            22 * unit,
            theme.levels[i % theme.levels.length],
          );
          l.questions.forEach((_, j) => {
            const groupW = contentW / s.levels.length,
              cellW = (groupW - 16) / l.questions.length,
              x = margin + i * groupW + j * cellW;
            d.rect(
              `progress_${i}_${j}`,
              x,
              safeH * 0.244,
              cellW - 4,
              22 * unit,
              theme.track,
            );
            if (i < li || (i === li && j <= qi))
              d.rect(
                `progress_fill_${i}_${j}`,
                x,
                safeH * 0.244,
                cellW - 4,
                22 * unit,
                theme.levels[i % theme.levels.length],
                i === li && j === qi ? { start: reveal } : {},
              );
          });
        });
        const py = landscape ? height * 0.39 : safeH * 0.323,
          pw = landscape ? width * 0.54 : contentW,
          ph = landscape ? height * 0.43 : safeH * (q.choices ? 0.25 : 0.305);
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
                    { t: reveal, v: s.questionEffect === "hide" ? 1 : 0 },
                  ],
                },
              };
        d.text(
          "question",
          q.q,
          margin + 28,
          py + 24,
          pw - 56,
          q.image ? ph * 0.3 : ph - 48,
          70 * unit,
          theme.text,
          effect,
        );
        if (q.image) {
          const prop =
              q.imageEffect === "zoom"
                ? "zoom"
                : q.imageEffect === "pixelate"
                  ? "pixelate"
                  : "blur",
            v =
              q.imageEffect === "zoom"
                ? 3
                : q.imageEffect === "pixelate"
                  ? 25
                  : 18;
          d.image(
            "question_image",
            q.image,
            margin + 28,
            py + ph * 0.34,
            pw - 56,
            ph * 0.62,
            {
              focusX: q.focusX,
              focusY: q.focusY,
              ...(q.imageEffect === "none"
                ? {}
                : {
                    keyframes: {
                      [prop]: [
                        { t: 0, v: prop === "zoom" ? 1 : 0, ease: "step" },
                        { t: read, v, ease: "step" },
                        { t: reveal, v: prop === "zoom" ? 1 : 0 },
                      ],
                    },
                  }),
            },
          );
        }
        const rx = landscape ? width * 0.79 : width / 2,
          ry = landscape ? height * 0.46 : safeH * (q.choices ? 0.72 : 0.787),
          r = landscape ? 65 : 130;
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
          end: reveal,
        });
        // A generic path traces the ring once over the countdown; no template-specific renderer.
        d.add("path", {
          id: "countdown_arc",
          x: 0,
          y: 0,
          d: `M ${rx} ${ry - r} A ${r} ${r} 0 1 1 ${rx - 0.01} ${ry - r}`,
          fill: "none",
          stroke: levelColor,
          strokeWidth: theme.shapes.ringWidth,
          start: read,
          end: reveal,
          keyframes: {
            draw: [
              { t: read, v: 1 },
              { t: reveal, v: 0 },
            ],
          },
        });
        for (let k = 0; k < t.countdown; k++)
          d.text(
            `count_${k}`,
            String(t.countdown - k),
            rx - r * 0.4,
            ry - r * 0.65,
            r,
            2 * r,
            landscape ? 64 : 150,
            theme.text,
            { start: read + k, end: read + k + 1 },
          );
        const ax = landscape ? width * 0.64 : margin,
          ay = landscape ? height * 0.64 : safeH * 0.665,
          aw = landscape ? width * 0.3 : contentW,
          ah = landscape ? height * 0.23 : safeH * 0.23;
        if (q.choices) {
          const cy = landscape ? height * 0.2 : safeH * 0.58,
            cw = landscape ? width * 0.3 : contentW;
          q.choices.forEach((choice, i) => {
            const x = landscape ? width * 0.64 : margin + ((i % 2) * cw) / 2,
              y = landscape
                ? cy + i * height * 0.055
                : cy + Math.floor(i / 2) * safeH * 0.045;
            d.text(
              `choice_${i}`,
              `${"ABCD"[i]}. ${choice}`,
              x,
              y,
              landscape ? cw : cw / 2 - 12,
              landscape ? height * 0.05 : safeH * 0.042,
              23 * unit,
              theme.muted,
            );
          });
        }
        d.rect("answer_panel", ax, ay, aw, ah, levelColor, { start: reveal });
        d.text(
          "answer",
          answerText,
          ax + 24,
          ay + 20,
          aw - 48,
          ah - 40,
          84 * unit,
          theme.background,
          { start: reveal },
        );
      });
    });
  });
  const outroStart = now;
  scene("outro", t.outro, "outro", (d) => {
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
    d.text(
      "outro_tiers",
      s.outro.tiers.join("\n"),
      width * 0.08,
      safeH * 0.4,
      width * 0.84,
      safeH * 0.28,
      40 * unit,
    );
    d.text(
      "outro_cta",
      s.outro.cta.join("\n"),
      width * 0.08,
      safeH * 0.75,
      width * 0.84,
      safeH * 0.2,
      32 * unit,
      theme.muted,
    );
  });
  voice(
    "outro",
    outroStart,
    t.outro,
    `${s.outro.title}. ${s.outro.cta.join(". ")}`,
  );
  events.push({ time: outroStart, type: "outro", id: "outro" });
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
    timeline: {
      duration: now,
      events: events.sort((a, b) => a.time - b.time),
      questions,
      intro,
      levels: levelCards,
      outro: { start: outroStart, end: now },
    },
    voiceScript,
  };
}
