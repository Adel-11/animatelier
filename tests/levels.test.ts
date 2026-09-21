import { animated } from "../packages/core/keyframes";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileQuiz } from "../packages/core/quiz";
import { resolveTheme } from "../packages/core/themes";
import { spokenNumbers } from "../packages/core/speech";
const input = {
  mode: "levels",
  theme: "light",
  intro: { title: "Test" },
  levels: [
    { name: "FIRST", questions: [{ q: "What is 720 plus 720?", a: "1440" }] },
  ],
};
it("compiles stable levels with frame-aligned voice slots and four ticks", () => {
  const a = compileQuiz(input),
    b = compileQuiz(input);
  expect(a).toEqual(b);
  expect(a.timeline.questions).toHaveLength(1);
  const q = a.timeline.questions[0];
  expect(q.ticks).toHaveLength(4);
  expect(q.reveal - q.readEnd).toBe(4);
  expect(a.voiceScript.find((s) => s.id === "question_1_answer")?.text).toBe(
    "one thousand four hundred and forty",
  );
  expect(a.project.width).toBe(1080);
  expect(a.project.scenes.every((s) => s.backdrop?.color === "#F5F7FA")).toBe(
    true,
  );
});
it("uses the supplied QFF reference questions and exact generator timing", () => {
  const spec = JSON.parse(
    readFileSync(
      new URL("../examples/quiz-levels.spec.json", import.meta.url),
      "utf8",
    ),
  );
  const built = compileQuiz(spec);
  expect(built.schedule).toHaveLength(15);
  expect(built.timeline.questions[0].start).toBe(8.7);
  expect(built.timeline.questions[0].readEnd).toBe(12.7);
  expect(built.duration).toBeCloseTo(178.1, 5);
  expect(built.project.scenes[0].elements.some((e) => e.type === "image")).toBe(
    true,
  );
});
it("merges nested theme fields and preserves older correct override", () => {
  const t = resolveTheme({ shapes: { radius: 9 }, correct: "#123456" }, "qff");
  expect(t.background).toBe("#07275F");
  expect(t.shapes.ringWidth).toBe(22);
  expect(t.shapes.radius).toBe(9);
  expect(t.answer).toBe("#123456");
  expect(() => resolveTheme({ logo: { src: "https://bad" } })).toThrow();
});
it("reduces answer first then reading and reports impossible duration", () => {
  const b = compileQuiz({ ...input, timing: { maxDuration: 1 } });
  expect(b.warnings.join(" ")).toContain("exceeds maxDuration");
  const q = b.timeline.questions[0];
  expect(q.end - q.reveal).toBeCloseTo(1);
  expect(q.readEnd - q.start).toBeCloseTo(3.5);
});
it("validates choice answers and applies image countdown effects", () => {
  const b = compileQuiz({
    ...input,
    format: "landscape",
    levels: [
      {
        name: "IMAGES",
        questions: [
          {
            q: "Name it",
            choices: ["A", "B"],
            correctIndex: 1,
            image: "file:picture.png",
            imageEffect: "pixelate",
          },
        ],
      },
    ],
  });
  const q = b.project.scenes.find((s) => s.id === "question_1")!;
  expect(
    q.elements
      .find((e) => e.id === "question_image")
      ?.keyframes.pixelate.map((k) => k.v),
  ).toEqual([0, 25, 0]);
  expect(b.project.width).toBe(1920);
  expect(() =>
    compileQuiz({
      ...input,
      levels: [
        {
          name: "BAD",
          questions: [{ q: "?", choices: ["A", "B"], correctIndex: 3 }],
        },
      ],
    }),
  ).toThrow();
});
it("speaks numbers in English and French", () => {
  expect(spokenNumbers("1440 and -2.5", "en")).toBe(
    "one thousand four hundred and forty and minus two point five",
  );
  expect(spokenNumbers("1440 et 81", "fr")).toBe(
    "mille quatre cent quarante et quatre-vingt-un",
  );
});

it("CLI theme overrides named spec theme while keeping field overrides", () => {
  expect(
    compileQuiz({ ...input, theme: "qff" }, "light").project.scenes[0].backdrop
      ?.color,
  ).toBe("#F5F7FA");
  expect(
    compileQuiz({ ...input, theme: { accent: "#123456" } }, "light").project
      .scenes[0].backdrop?.color,
  ).toBe("#F5F7FA");
});

it("holds image and question effects through the entire countdown", () => {
  for (const effect of ["blur", "hide"] as const) {
    const b = compileQuiz({
      ...input,
      questionEffect: effect,
      levels: [
        {
          name: "IMAGE",
          questions: [
            { q: "Who?", a: "A", image: "file:a.png", imageEffect: "pixelate" },
          ],
        },
      ],
    });
    const timing = b.timeline.questions[0],
      local = timing.readEnd - timing.start + 2,
      scene = b.project.scenes.find((s) => s.id === timing.id)!;
    const text = scene.elements.find((e) => e.id === "question")!,
      im = scene.elements.find((e) => e.id === "question_image")!;
    expect(animated(text, local)[effect === "hide" ? "opacity" : "blur"]).toBe(
      effect === "hide" ? 0 : 16,
    );
    expect((animated(im, local) as { pixelate?: number }).pixelate).toBe(25);
    expect(
      (
        animated(im, Math.round((timing.reveal - timing.start) * 30) / 30) as {
          pixelate?: number;
        }
      ).pixelate,
    ).toBe(0);
  }
});
it("uses remaining reading capacity before warning about the duration cap", () => {
  const b = compileQuiz({
    ...input,
    timing: { answer: 1, answerMin: 1, maxDuration: 29.9 },
    levels: [
      {
        name: "ONE",
        questions: [
          {
            q: "This long question has enough characters to reach the maximum reading duration?",
            a: "A",
          },
          { q: "Short?", a: "B" },
        ],
      },
    ],
  });
  expect(b.duration).toBeLessThanOrEqual(29.9 + 1 / 30);
  expect(b.warnings.some((w) => w.includes("exceeds maxDuration"))).toBe(false);
});
it("warns when a spoken answer cannot fit its estimated slot", () => {
  const b = compileQuiz({
    ...input,
    levels: [
      {
        name: "ONE",
        questions: [
          {
            q: "?",
            a: "This is a very long answer which requires many seconds to read aloud clearly.",
          },
        ],
      },
    ],
  });
  expect(
    b.warnings.some((w) => w.includes("Voice slot question_1_answer")),
  ).toBe(true);
});
it("uses the reference QFF logo sizes and offsets", () => {
  const b = compileQuiz({ ...input, theme: "qff" }),
    cover = b.project.scenes[0].elements.find((e) => e.id === "cover_logo")!,
    logo = b.project.scenes
      .find((s) => s.id === "question_1")!
      .elements.find((e) => e.id === "brand_logo")!;
  expect(cover).toMatchObject({ x: 110, y: 530, w: 860, h: 860 });
  expect(logo).toMatchObject({ x: 50, y: 165, w: 190, h: 190 });
});
