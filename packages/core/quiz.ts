import {
  compileLevels,
  levelsSchema,
  normalizeLevels,
  type CompileOptions,
} from "./levels";
import { compileStack, stackSchema } from "./stack";
import { resolveTheme, themeInputSchema } from "./themes";
import { wrapText } from "./text";
import { z } from "zod";
import { newActor, parseProject } from "./schema";
import { newElement, type SceneElement } from "./elements";

const label = (max: number) => z.string().trim().min(1).max(max);
const classicQuizSchema = z
  .object({
    title: label(80),
    mode: z.enum(["choices", "list", "cards"]),
    revealDelay: z.number().finite().min(0.5).max(30).default(3),
    answerDuration: z.number().finite().min(0.5).max(30).default(2),
    listSize: z.number().int().min(1).max(10).default(10),
    theme: themeInputSchema.optional(),
    layout: z
      .enum(["classic", "game-show", "minimal", "presenter"])
      .default("classic"),
    motion: z.enum(["fade", "slide", "pop", "none"]).default("fade"),
    progress: z.enum(["counter", "bar", "both", "none"]).default("both"),
    labels: z
      .object({
        question: label(30).default("QUESTION"),
        answer: label(50).default("RÉPONSE"),
        correct: label(50).default("Bonne réponse"),
      })
      .strict()
      .default({}),
    presenter: z
      .object({
        name: label(80).default("Présentateur"),
        side: z.enum(["left", "right"]).default("right"),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#8777EE"),
        skin: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#EAB894"),
        scale: z.number().min(0.45).max(1.5).default(0.8),
        action: z
          .enum(["idle", "wave", "talk", "celebrate", "point"])
          .default("talk"),
        dialogue: z.enum(["question", "answer", "none"]).default("question"),
      })
      .strict()
      .optional(),
    questions: z
      .array(
        z
          .object({
            question: label(180),
            answer: label(80).optional(),
            choices: z.array(label(80)).min(2).max(4).optional(),
            correctIndex: z.number().int().min(0).max(3).optional(),
            hint: label(120).optional(),
            explanation: label(240).optional(),
            points: z.number().int().min(0).max(1000000).optional(),
            theme: themeInputSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (spec.mode === "list" && spec.questions.length > spec.listSize)
      issue(["listSize"], "La liste doit contenir une case par question.");
    spec.questions.forEach((q, i) => {
      if (spec.mode === "list" || spec.mode === "cards") {
        if (!q.answer)
          issue(["questions", i, "answer"], "Réponse requise dans ce mode.");
        if (q.choices !== undefined || q.correctIndex !== undefined)
          issue(
            ["questions", i],
            "choices et correctIndex sont réservés au mode QCM.",
          );
      } else {
        if (
          !q.choices ||
          q.correctIndex === undefined ||
          q.correctIndex >= q.choices.length
        )
          issue(
            ["questions", i, "correctIndex"],
            "Fournir 2 à 4 choix et l’index du bon choix (depuis zéro).",
          );
        if (q.choices && new Set(q.choices).size !== q.choices.length)
          issue(
            ["questions", i, "choices"],
            "Les choix doivent être distincts.",
          );
        if (q.answer !== undefined)
          issue(
            ["questions", i, "answer"],
            "En QCM, la réponse est choices[correctIndex] ; omettre answer.",
          );
      }
    });
  });

// Shared bundled-font advances; no platform font lookup.
function fit(
  text: string,
  width: number,
  height: number,
  maximum: number,
  bold: boolean,
  family = "DejaVu Sans",
) {
  for (let fontSize = maximum; fontSize >= 8; fontSize--) {
    const lines = wrapText(text, fontSize, width, family, bold);
    if (lines.length * fontSize * 1.2 <= height || fontSize === 8)
      return { text: lines.join("\n"), fontSize };
  }
  throw new Error("Texte impossible à disposer.");
}

export const quizSchema = z.preprocess(
  normalizeLevels,
  z.union([classicQuizSchema, levelsSchema, stackSchema]),
);

export function compileQuiz(
  input: unknown,
  baseTheme?: unknown,
  options: CompileOptions = {},
) {
  input = normalizeLevels(input);
  if (
    input &&
    typeof input === "object" &&
    "mode" in input &&
    input.mode === "levels"
  )
    return compileLevels(input, baseTheme, options);
  if (
    input &&
    typeof input === "object" &&
    "mode" in input &&
    input.mode === "stack"
  )
    return compileStack(input, baseTheme, options);
  const spec = classicQuizSchema.parse(input);
  const duration = spec.revealDelay + spec.answerDuration;
  const theme = resolveTheme(
    typeof spec.theme === "object"
      ? spec.theme
      : (baseTheme ?? spec.theme ?? "default"),
    baseTheme,
  );
  const schedule = spec.questions.map((_, i) => ({
    sceneId: `question_${i + 1}`,
    question: i + 1,
    start: i * duration,
    reveal: i * duration + spec.revealDelay,
    end: (i + 1) * duration,
  }));
  const scenes = spec.questions.map((q, index) => {
    const palette = q.theme ? resolveTheme(q.theme, theme) : theme;
    const elements: SceneElement[] = [];
    const rect = (
      id: string,
      x: number,
      y: number,
      w: number,
      h: number,
      fill: string,
      extra = {},
    ) =>
      elements.push(
        newElement("rect", duration, {
          id,
          x,
          y,
          w,
          h,
          fill,
          radius: palette.shapes.radius,
          ...extra,
        }),
      );
    const text = (
      id: string,
      value: string,
      x: number,
      y: number,
      w: number,
      h: number,
      size: number,
      extra = {},
    ) => {
      const fitted = fit(
        value,
        w,
        h,
        size * palette.typography.scale,
        "bold" in extra && extra.bold === true,
        palette.typography.family,
      );
      elements.push(
        newElement("text", duration, {
          id,
          x,
          y: y + fitted.fontSize,
          ...fitted,
          color: palette.text,
          ...extra,
        }),
      );
    };
    const reveal = { start: spec.revealDelay };
    if (!palette.backdrop)
      rect("background", 0, 0, 1280, 720, palette.background, { radius: 0 });
    if (palette.logo && palette.logo.scenes.includes("question")) {
      const l = palette.logo;
      elements.push(
        newElement("image" as SceneElement["type"], duration, {
          id: "brand_logo",
          src: l.src,
          x: l.placement.endsWith("right")
            ? 1280 - (l.marginX ?? l.margin) - l.size
            : (l.marginX ?? l.margin),
          y: l.placement.startsWith("bottom")
            ? 720 - (l.marginY ?? l.margin) - l.size
            : (l.marginY ?? l.margin),
          w: l.size,
          h: l.size,
          fit: "contain",
        }),
      );
    }
    const minimal = spec.layout === "minimal";
    const gameShow = spec.layout === "game-show";
    const hasPresenter = spec.layout === "presenter" || !!spec.presenter;
    const presenterSide = spec.presenter?.side ?? "right";
    const contentX = hasPresenter && presenterSide === "left" ? 390 : 48;
    const contentWidth = hasPresenter ? 842 : gameShow ? 850 : 1184;
    const enter = (x: number) => {
      if (spec.motion === "none") return {};
      if (spec.motion === "slide")
        return {
          keyframes: {
            x: [
              { t: 0, v: x - 42 },
              { t: 0.28, v: x, ease: "easeOut" },
            ],
            opacity: [
              { t: 0, v: 0 },
              { t: 0.2, v: 1 },
            ],
          },
        };
      if (spec.motion === "pop")
        return {
          keyframes: {
            scale: [
              { t: 0, v: 0.82 },
              { t: 0.25, v: 1, ease: "easeOut" },
            ],
            opacity: [
              { t: 0, v: 0 },
              { t: 0.16, v: 1 },
            ],
          },
        };
      return {
        keyframes: {
          opacity: [
            { t: 0, v: 0 },
            { t: 0.25, v: 1 },
          ],
        },
      };
    };
    if (!minimal)
      text("heading", spec.title, 64, 25, 1152, 66, 30, {
        bold: true,
        color: palette.accent,
      });
    if (spec.progress === "counter" || spec.progress === "both")
      text(
        "step",
        `${spec.labels.question} ${index + 1} / ${spec.questions.length}`,
        64,
        minimal ? 28 : 104,
        1100,
        30,
        18,
      );
    const questionY = minimal ? 76 : 150;
    const questionHeight = spec.mode === "list" ? 382 : minimal ? 240 : 200;
    const questionWidth = spec.mode === "list" ? 500 : contentWidth - 96;
    rect(
      "question_panel",
      contentX,
      questionY,
      spec.mode === "list" ? 572 : contentWidth,
      questionHeight,
      palette.panel,
    );
    text(
      "question",
      q.question,
      contentX + 32,
      questionY + 25,
      questionWidth,
      questionHeight - (q.hint ? 85 : 50),
      38,
      {
        bold: true,
        ...enter(contentX + 32),
      },
    );
    if (q.hint)
      text(
        "hint",
        q.hint,
        contentX + 32,
        questionY + questionHeight - 58,
        questionWidth,
        38,
        18,
        { color: palette.muted },
      );
    if (q.points !== undefined)
      text(
        "points",
        `${q.points} pts`,
        contentX + contentWidth - 170,
        questionY + 16,
        140,
        32,
        18,
        { color: palette.accent, bold: true },
      );
    const barWidth = spec.mode === "list" ? 572 : 1184;
    const barY = spec.mode === "list" ? 555 : 390;
    if (spec.progress === "bar" || spec.progress === "both") {
      const actualBarWidth = spec.mode === "list" ? barWidth : contentWidth;
      rect("timer_track", contentX, barY, actualBarWidth, 6, palette.track, {
        radius: 3,
      });
      rect("timer", contentX, barY, actualBarWidth, 6, palette.accent, {
        radius: 3,
        keyframes: {
          w: [
            { t: 0, v: actualBarWidth },
            { t: spec.revealDelay, v: 0 },
          ],
        },
      });
    }
    if (spec.mode === "list") {
      for (let row = 0; row < spec.listSize; row++) {
        const y = 150 + row * 48;
        rect(`list_slot_${row + 1}`, 660, y, 572, 42, palette.panel, {
          radius: 8,
        });
        text(
          `list_number_${row + 1}`,
          String(row + 1).padStart(2, "0"),
          674,
          y + 7,
          40,
          27,
          20,
          { color: palette.accent, bold: true },
        );
        if (row <= index) {
          if (row === index)
            rect(`list_highlight_${row + 1}`, 720, y, 512, 42, palette.answer, {
              ...reveal,
              radius: 8,
            });
          text(
            `list_answer_${row + 1}`,
            spec.questions[row].answer!,
            736,
            y + 3,
            478,
            36,
            22,
            row === index ? reveal : {},
          );
        }
      }
      text(
        "answer_label",
        `${spec.labels.answer} AJOUTÉE À LA LISTE`,
        64,
        585,
        520,
        48,
        22,
        {
          ...reveal,
          color: palette.accent,
        },
      );
    } else if (spec.mode === "cards") {
      rect(
        "answer_panel",
        contentX,
        430,
        contentWidth,
        q.explanation ? 196 : 150,
        palette.answer,
        { ...reveal, stroke: palette.accent, strokeWidth: 3 },
      );
      text(
        "card_answer",
        q.answer!,
        contentX + 36,
        454,
        contentWidth - 72,
        q.explanation ? 74 : 100,
        38,
        { ...reveal, bold: true },
      );
      if (q.explanation)
        text(
          "explanation",
          q.explanation,
          contentX + 36,
          548,
          contentWidth - 72,
          62,
          19,
          { ...reveal, color: palette.text },
        );
    } else {
      q.choices!.forEach((choice, i) => {
        const oneColumn = gameShow || hasPresenter;
        const choiceWidth = oneColumn ? contentWidth : 580;
        const x = oneColumn ? contentX : 48 + (i % 2) * 604;
        const y = oneColumn ? 420 + i * 62 : 422 + Math.floor(i / 2) * 104;
        const choiceHeight = oneColumn ? 54 : 92;
        rect(
          `choice_panel_${i + 1}`,
          x,
          y,
          choiceWidth,
          choiceHeight,
          palette.panel,
          enter(x),
        );
        if (i === q.correctIndex)
          rect(
            `correct_${i + 1}`,
            x,
            y,
            choiceWidth,
            choiceHeight,
            palette.answer,
            {
              ...reveal,
              stroke: palette.accent,
              strokeWidth: 3,
            },
          );
        text(
          `choice_${i + 1}`,
          `${"ABCD"[i]}. ${choice}`,
          x + 24,
          y + (oneColumn ? 5 : 12),
          choiceWidth - 48,
          oneColumn ? 42 : 66,
          oneColumn ? 22 : 26,
        );
      });
      if (gameShow) {
        for (let row = 0; row < spec.questions.length; row++) {
          const reverse = spec.questions.length - row;
          const y = 150 + row * Math.min(38, 460 / spec.questions.length);
          rect(
            `ladder_${reverse}`,
            930,
            y,
            302,
            Math.min(32, 420 / spec.questions.length),
            reverse === index + 1 ? palette.answer : palette.panel,
            { radius: 8 },
          );
          text(
            `ladder_text_${reverse}`,
            `${String(reverse).padStart(2, "0")}  ${spec.questions[reverse - 1].points ?? reverse * 100}`,
            948,
            y + 1,
            266,
            Math.min(29, 410 / spec.questions.length),
            16,
            {
              color: reverse === index + 1 ? palette.text : palette.muted,
              bold: true,
            },
          );
        }
      }
      text(
        "answer_label",
        `${spec.labels.correct} : ${"ABCD"[q.correctIndex!]}`,
        64,
        648,
        1100,
        40,
        24,
        { ...reveal, color: palette.accent, bold: true },
      );
      if (q.explanation)
        text("explanation", q.explanation, 310, 650, 900, 38, 17, {
          ...reveal,
          color: palette.muted,
        });
    }
    const presenter =
      spec.presenter ??
      (spec.layout === "presenter"
        ? {
            name: "Présentateur",
            side: "right" as const,
            color: "#8777EE",
            skin: "#EAB894",
            scale: 0.8,
            action: "talk" as const,
            dialogue: "question" as const,
          }
        : undefined);
    const actors = presenter
      ? [
          newActor(duration, {
            id: "quiz_presenter",
            name: presenter.name,
            x: presenter.side === "left" ? 185 : 1095,
            y: 650,
            scale: presenter.scale,
            color: presenter.color,
            skin: presenter.skin,
            action: presenter.action,
            flip: presenter.side === "right",
            dialogue: "",
            timeline:
              presenter.dialogue === "question"
                ? [
                    {
                      start: 0,
                      end: duration,
                      action: presenter.action,
                      dialogue: q.question,
                    },
                  ]
                : presenter.dialogue === "answer"
                  ? [
                      {
                        start: 0,
                        end: spec.revealDelay,
                        action: "idle",
                        dialogue: "",
                      },
                      {
                        start: spec.revealDelay,
                        end: duration,
                        action: presenter.action,
                        dialogue: q.answer ?? q.choices![q.correctIndex!],
                      },
                    ]
                  : [],
          }),
        ]
      : [];
    return {
      id: schedule[index].sceneId,
      name: `Question ${index + 1}`,
      duration,
      background: "studio",
      title: "",
      actors,
      elements,
      backdrop: palette.backdrop ?? {
        type: "solid",
        color: palette.background,
      },
    };
  });
  // Compilation is pure: a stable ID permits reproducible output. Loading creates a fresh ID.
  const project = parseProject({
    fontFamily: theme.typography.family,
    schemaVersion: 2,
    id: "quiz_compiled",
    name: spec.title,
    width: 1280,
    height: 720,
    fps: 30,
    scenes,
  });
  return {
    ok: true as const,
    project,
    duration: duration * scenes.length,
    schedule,
    warnings: [] as string[],
    timeline: {
      duration: duration * scenes.length,
      events: schedule.flatMap((q) => [
        { time: q.start, type: "question", id: q.sceneId },
        { time: q.reveal, type: "reveal", id: q.sceneId },
      ]),
      questions: schedule.map((q) => ({
        id: q.sceneId,
        start: q.start,
        readEnd: q.reveal,
        ticks: [] as number[],
        reveal: q.reveal,
        end: q.end,
      })),
    },
    voiceScript: schedule.flatMap((q, i) => [
      {
        id: q.sceneId,
        start: q.start,
        maxDuration: spec.revealDelay,
        text: spec.questions[i].question,
      },
      {
        id: `${q.sceneId}_answer`,
        start: q.reveal,
        maxDuration: spec.answerDuration,
        text:
          spec.questions[i].answer ??
          spec.questions[i].choices![spec.questions[i].correctIndex!],
      },
    ]),
  };
}

export const quizExamples = {
  choices: {
    title: "À vous de jouer",
    mode: "choices",
    revealDelay: 3,
    answerDuration: 2,
    questions: [
      {
        question: "Combien font 6 × 7 ?",
        choices: ["36", "42", "48", "54"],
        correctIndex: 1,
      },
    ],
  },
  list: {
    title: "Dix capitales à retrouver",
    mode: "list",
    listSize: 10,
    revealDelay: 3,
    answerDuration: 2,
    questions: [
      ["France", "Paris"],
      ["Italie", "Rome"],
      ["Espagne", "Madrid"],
      ["Portugal", "Lisbonne"],
      ["Allemagne", "Berlin"],
      ["Belgique", "Bruxelles"],
      ["Japon", "Tokyo"],
      ["Canada", "Ottawa"],
      ["Australie", "Canberra"],
      ["Sénégal", "Dakar"],
    ].map(([country, answer]) => ({
      question: `Quelle est la capitale de ce pays : ${country} ?`,
      answer,
    })),
  },
  millionaire: {
    title: "Le grand défi",
    mode: "choices",
    layout: "game-show",
    theme: "game-show",
    motion: "slide",
    revealDelay: 5,
    answerDuration: 2.5,
    questions: [
      {
        question: "Quelle planète est surnommée la planète rouge ?",
        choices: ["Vénus", "Mars", "Jupiter", "Mercure"],
        correctIndex: 1,
        points: 100,
        explanation: "Sa surface est riche en oxydes de fer.",
      },
      {
        question: "Quel océan est le plus vaste ?",
        choices: ["Atlantique", "Indien", "Arctique", "Pacifique"],
        correctIndex: 3,
        points: 500,
      },
      {
        question: "Qui a peint La Nuit étoilée ?",
        choices: ["Monet", "Van Gogh", "Klimt", "Matisse"],
        correctIndex: 1,
        points: 1000,
      },
    ],
  },
  presenter: {
    title: "Le quiz de Camille",
    mode: "choices",
    layout: "presenter",
    theme: "paper",
    motion: "pop",
    presenter: {
      name: "Camille",
      side: "right",
      color: "#C64B3C",
      skin: "#D99A72",
      scale: 0.78,
      action: "point",
      dialogue: "question",
    },
    questions: [
      {
        question: "Quel animal peut dormir debout ?",
        hint: "On le rencontre souvent dans les prés.",
        choices: ["Le cheval", "Le chat", "Le panda", "La loutre"],
        correctIndex: 0,
      },
    ],
  },
  flashcards: {
    title: "Révisions express",
    mode: "cards",
    layout: "minimal",
    theme: "neon",
    motion: "fade",
    progress: "bar",
    revealDelay: 3,
    answerDuration: 3,
    questions: [
      {
        question: "Que signifie HTTP ?",
        answer: "HyperText Transfer Protocol",
        explanation:
          "Le protocole utilisé pour transférer les ressources du Web.",
      },
      {
        question: "Quelle est la complexité d’une recherche binaire ?",
        answer: "O(log n)",
      },
    ],
  },
  customArtDirection: {
    title: "Direction artistique libre",
    mode: "cards",
    layout: "classic",
    motion: "slide",
    progress: "both",
    theme: {
      extends: "default",
      background: "#241134",
      panel: "#3B1F52",
      track: "#51306B",
      text: "#FFF4E8",
      muted: "#D3BFD9",
      accent: "#FFB86B",
      answer: "#B23A68",
      backdrop: {
        type: "linear",
        color: "#241134",
        color2: "#531B49",
        angle: 120,
      },
      typography: { family: "DejaVu Sans Mono", scale: 1.05, bold: true },
      shapes: { radius: 48, ringWidth: 12 },
    },
    labels: {
      question: "CARTE",
      answer: "RÉVÉLATION",
      correct: "Solution",
    },
    questions: [
      {
        question: "Quel détail graphique rend cette carte unique ?",
        answer:
          "Tout est piloté par la spec : couleurs, formes, typo et mouvement.",
      },
    ],
  },
  levelsShow: {
    mode: "levels",
    title: "Défi trois niveaux",
    format: "reel-9x16",
    theme: "neon",
    language: "fr",
    intro: {
      title: "DÉFI EXPRESS",
      subtitle: "3 NIVEAUX",
      tagline: "Jusqu’où irez-vous ?",
    },
    levels: [
      {
        name: "FACILE",
        questions: [{ q: "Combien font 9 + 6 ?", a: "15" }],
      },
      {
        name: "INTERMÉDIAIRE",
        questions: [
          {
            q: "Quel langage s’exécute nativement dans un navigateur ?",
            choices: ["Python", "JavaScript", "Rust", "Go"],
            correctIndex: 1,
          },
        ],
      },
      {
        name: "EXPERT",
        questions: [
          { q: "Quel est le symbole chimique du tungstène ?", a: "W" },
        ],
      },
    ],
    outro: {
      title: "Quel est votre score ?",
      tiers: ["1/3 Curieux", "2/3 Solide", "3/3 Expert"],
      cta: ["Partagez votre résultat"],
    },
  },
  stack: {
    mode: "stack",
    title: "5 ANIMAUX À DEVINER",
    language: "fr",
    theme: "neon",
    end: { text: "Tu en as trouvé combien ?" },
    items: [
      { q: "Le roi de la savane", a: "Lion" },
      { q: "Il porte sa maison", a: "Escargot" },
      { q: "Il vole la nuit", a: "Hibou" },
      { q: "Le géant des océans", a: "Baleine" },
      { q: "Il change de couleur", a: "Caméléon" },
    ],
  },
};
