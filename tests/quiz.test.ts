import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileQuiz, quizExamples } from "../packages/core/quiz";
import { quizGuide } from "../packages/core/quiz-guide";
import { getStateAt, validateProject } from "../packages/core/agent";
import { renderProjectSvg } from "../packages/renderer/svg";

it("remplit les dix cases à trois secondes, conserve les réponses et respecte chaque frontière", () => {
  const built = compileQuiz(quizExamples.list);
  expect(built.duration).toBe(50);
  expect(validateProject(built.project).ok).toBe(true);
  const shown = (time: number) =>
    getStateAt(built.project, time).elements.filter(
      (e) =>
        e.element.id.startsWith("list_answer_") &&
        e.visible &&
        e.effectiveOpacity > 0,
    );
  expect(shown(0)).toHaveLength(0);
  for (const [i, timing] of built.schedule.entries()) {
    expect(shown(timing.reveal - 0.001)).toHaveLength(i);
    expect(shown(timing.reveal)).toHaveLength(i + 1);
    expect(shown(timing.end)).toHaveLength(i + 1);
    expect(getStateAt(built.project, timing.start).scene.id).toBe(
      timing.sceneId,
    );
  }
  expect(shown(50).map((e) => e.displayText?.replaceAll("\n", " "))).toEqual(
    quizExamples.list.questions.map((q) => q.answer),
  );
  expect(compileQuiz(quizExamples.list)).toEqual(built);
});

it("révèle le bon choix, accepte les délais réglables et échappe les textes", () => {
  const built = compileQuiz({
    ...quizExamples.choices,
    revealDelay: 0.5,
    answerDuration: 0.5,
    questions: [
      {
        question: '<script>alert("x")</script>',
        choices: ["<svg>", "& test"],
        correctIndex: 0,
      },
    ],
  });
  expect(built.duration).toBe(1);
  expect(
    getStateAt(built.project, 0.499).elements.find(
      (e) => e.element.id === "correct_1",
    )?.visible,
  ).toBe(false);
  expect(
    getStateAt(built.project, 0.5).elements.find(
      (e) => e.element.id === "correct_1",
    )?.visible,
  ).toBe(true);
  expect(renderProjectSvg(built.project, 0.5)).not.toContain("<script>");
  expect(renderProjectSvg(built.project, 0.5)).toContain("&lt;svg&gt;");
});

it("rejette les scénarios ambigus ou hors limites et conserve la documentation intégrée", () => {
  for (const spec of [
    { ...quizExamples.list, listSize: 9 },
    { ...quizExamples.list, revealDelay: 0 },
    { ...quizExamples.list, questions: [{ question: "?" }] },
    {
      ...quizExamples.list,
      questions: [{ question: "?", answer: " ", correctIndex: 0 }],
    },
    {
      ...quizExamples.choices,
      questions: [{ question: "?", choices: ["A", "B"], correctIndex: 2 }],
    },
    {
      ...quizExamples.choices,
      questions: [{ question: "?", choices: [" A ", "A"], correctIndex: 0 }],
    },
    {
      ...quizExamples.choices,
      questions: [
        { question: "?", choices: ["A", "B"], correctIndex: 0, answer: "B" },
      ],
    },
    { ...quizExamples.list, theme: { background: "url(https://x)" } },
  ])
    expect(() => compileQuiz(spec)).toThrow();
  expect(quizGuide).toBe(
    readFileSync("docs/QUIZ.md", "utf8").replaceAll("\r\n", "\n"),
  );
});
