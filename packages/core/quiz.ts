import { wrapText } from "./text";
import { z } from "zod";
import { color, parseProject } from "./schema";
import { newElement, type SceneElement } from "./elements";

const label = (max: number) => z.string().trim().min(1).max(max);
export const quizSchema = z
  .object({
    title: label(80),
    mode: z.enum(["choices", "list"]),
    revealDelay: z.number().finite().min(0.5).max(30).default(3),
    answerDuration: z.number().finite().min(0.5).max(30).default(2),
    listSize: z.number().int().min(1).max(10).default(10),
    theme: z
      .object({
        background: color.default("#10182f"),
        panel: color.default("#202d49"),
        text: color.default("#f5f7ff"),
        accent: color.default("#e7bd65"),
        correct: color.default("#237c63"),
      })
      .strict()
      .default({}),
    questions: z
      .array(
        z
          .object({
            question: label(180),
            answer: label(80).optional(),
            choices: z.array(label(80)).min(2).max(4).optional(),
            correctIndex: z.number().int().min(0).max(3).optional(),
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
      if (spec.mode === "list") {
        if (!q.answer)
          issue(["questions", i, "answer"], "Réponse requise en mode liste.");
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
) {
  for (let fontSize = maximum; fontSize >= 8; fontSize--) {
    const lines = wrapText(text, fontSize, width, "DejaVu Sans", bold);
    if (lines.length * fontSize * 1.2 <= height || fontSize === 8)
      return { text: lines.join("\n"), fontSize };
  }
  throw new Error("Texte impossible à disposer.");
}

export function compileQuiz(input: unknown) {
  const spec = quizSchema.parse(input);
  const duration = spec.revealDelay + spec.answerDuration;
  const theme = spec.theme;
  const schedule = spec.questions.map((_, i) => ({
    sceneId: `question_${i + 1}`,
    question: i + 1,
    start: i * duration,
    reveal: i * duration + spec.revealDelay,
    end: (i + 1) * duration,
  }));
  const scenes = spec.questions.map((q, index) => {
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
          radius: 16,
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
        size,
        "bold" in extra && extra.bold === true,
      );
      elements.push(
        newElement("text", duration, {
          id,
          x,
          y: y + fitted.fontSize,
          ...fitted,
          color: theme.text,
          ...extra,
        }),
      );
    };
    const reveal = { start: spec.revealDelay };
    rect("background", 0, 0, 1280, 720, theme.background, { radius: 0 });
    text("heading", spec.title, 64, 25, 1152, 66, 30, {
      bold: true,
      color: theme.accent,
    });
    text(
      "step",
      `QUESTION ${index + 1} / ${spec.questions.length}`,
      64,
      104,
      1100,
      30,
      18,
    );
    const questionWidth = spec.mode === "list" ? 500 : 1088;
    rect(
      "question_panel",
      48,
      150,
      spec.mode === "list" ? 572 : 1184,
      spec.mode === "list" ? 382 : 220,
      theme.panel,
    );
    text(
      "question",
      q.question,
      80,
      175,
      questionWidth,
      spec.mode === "list" ? 320 : 165,
      38,
      {
        bold: true,
        keyframes: {
          opacity: [
            { t: 0, v: 0 },
            { t: 0.25, v: 1 },
          ],
        },
      },
    );
    const barWidth = spec.mode === "list" ? 572 : 1184;
    const barY = spec.mode === "list" ? 555 : 390;
    rect("timer_track", 48, barY, barWidth, 6, theme.panel, { radius: 3 });
    rect("timer", 48, barY, barWidth, 6, theme.accent, {
      radius: 3,
      keyframes: {
        w: [
          { t: 0, v: barWidth },
          { t: spec.revealDelay, v: 0 },
        ],
      },
    });
    if (spec.mode === "list") {
      for (let row = 0; row < spec.listSize; row++) {
        const y = 150 + row * 48;
        rect(`list_slot_${row + 1}`, 660, y, 572, 42, theme.panel, {
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
          { color: theme.accent, bold: true },
        );
        if (row <= index) {
          if (row === index)
            rect(`list_highlight_${row + 1}`, 720, y, 512, 42, theme.correct, {
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
      text("answer_label", "RÉPONSE AJOUTÉE À LA LISTE", 64, 585, 520, 48, 22, {
        ...reveal,
        color: theme.accent,
      });
    } else {
      q.choices!.forEach((choice, i) => {
        const x = 48 + (i % 2) * 604,
          y = 422 + Math.floor(i / 2) * 104;
        rect(`choice_panel_${i + 1}`, x, y, 580, 92, theme.panel);
        if (i === q.correctIndex)
          rect(`correct_${i + 1}`, x, y, 580, 92, theme.correct, {
            ...reveal,
            stroke: theme.accent,
            strokeWidth: 3,
          });
        text(
          `choice_${i + 1}`,
          `${"ABCD"[i]}. ${choice}`,
          x + 24,
          y + 12,
          532,
          66,
          26,
        );
      });
      text(
        "answer_label",
        `Bonne réponse : ${"ABCD"[q.correctIndex!]}`,
        64,
        648,
        1100,
        40,
        24,
        { ...reveal, color: theme.accent, bold: true },
      );
    }
    return {
      id: schedule[index].sceneId,
      name: `Question ${index + 1}`,
      duration,
      background: "studio",
      title: "",
      actors: [],
      elements,
    };
  });
  // Compilation is pure: a stable ID permits reproducible output. Loading creates a fresh ID.
  const project = parseProject({
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
};
