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
  expect(t.shapes.ringWidth).toBe(14);
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
