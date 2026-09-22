import { expect, it } from "vitest";
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
  expect(quizGuide).toContain("game-show");
  expect(quizGuide).toContain("presenter");
});

it("compile les formats créatifs et expose des primitives toujours éditables", () => {
  for (const example of Object.values(quizExamples))
    expect(validateProject(compileQuiz(example).project).ok).toBe(true);
  const game = compileQuiz(quizExamples.millionaire);
  expect(validateProject(game.project).ok).toBe(true);
  expect(game.project.scenes[0].elements.some((e) => e.id === "ladder_1")).toBe(
    true,
  );
  expect(game.project.scenes[0].backdrop?.type).toBe("linear");

  const presented = compileQuiz(quizExamples.presenter);
  expect(presented.project.scenes[0].actors[0]).toMatchObject({
    id: "quiz_presenter",
    name: "Camille",
    action: "point",
    timeline: [
      { action: "point", dialogue: "Quel animal peut dormir debout ?" },
    ],
  });
  expect(
    presented.project.scenes[0].elements.some((e) => e.id === "hint"),
  ).toBe(true);

  const cards = compileQuiz(quizExamples.flashcards);
  const before = getStateAt(cards.project, cards.schedule[0].reveal - 0.001);
  const after = getStateAt(cards.project, cards.schedule[0].reveal);
  expect(
    before.elements.find((e) => e.element.id === "card_answer")?.visible,
  ).toBe(false);
  expect(
    after.elements.find((e) => e.element.id === "card_answer")?.visible,
  ).toBe(true);
  expect(compileQuiz(quizExamples.customArtDirection).project.fontFamily).toBe(
    "DejaVu Sans Mono",
  );
});
