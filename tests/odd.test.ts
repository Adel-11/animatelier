import { expect, it } from "vitest";
import { compileQuiz } from "../packages/core/quiz";
import { flattenElements } from "../packages/core/elements";
import { emojiOnly, emojiFile } from "../packages/core/emoji";
import { elementStates } from "../packages/core/element-state";

const odd = {
  mode: "odd",
  language: "en",
  background: { images: ["file:bg.jpg"] },
  timing: { show: 1, countdown: 3, reveal: 2.5 },
  items: [
    { choices: ["Mercury", "Venus", "Pluto", "Mars"], correctIndex: 2, explanation: "Dwarf planet" },
    { choices: ["Whale", "Dolphin", "Shark"], a: "Shark" },
    { choices: ["🍎", "🍌", "🥕", "🍇"], correctIndex: 2, sayAnswer: "The carrot!" },
  ],
  sequence: [{ after: "question_1", id: "cta", duration: 2 }],
};

it("compiles the odd-one-out mode: circle, countdown, reveal to the centre", () => {
  const out = compileQuiz(odd);
  const scenes = out.project.scenes;
  expect(scenes.map((s) => s.id)).toEqual(["question_1", "cta", "question_2", "question_3", "outro"]);
  const q1 = scenes[0];
  const ids = flattenElements(q1.elements).map((e) => e.id);
  expect(ids).toEqual(expect.arrayContaining(["choice_1", "choice_3_odd", "timer_3", "timer_1", "odd_label", "explanation"]));
  const reveal = out.timeline.questions[0].reveal;
  // Before the reveal the odd choice sits on the circle; after, it is at the centre and enlarged.
  const before = elementStates(q1.elements, reveal - 0.1).find((s) => s.element.id === "choice_3")!;
  const after = elementStates(q1.elements, reveal + 1.2).find((s) => s.element.id === "choice_3")!;
  expect(before.element.y).toBeGreaterThan(1100);
  expect(after.element.x).toBeCloseTo(540, 0);
  expect(after.element.y).toBeCloseTo(960, 0);
  expect(after.element.scale).toBeCloseTo(1.3, 1);
  const other = elementStates(q1.elements, reveal + 1.2).find((s) => s.element.id === "choice_1")!;
  expect(other.element.opacity).toBe(0);
  // Voice slots follow the stack convention.
  expect(out.voiceScript.map((v) => v.id)).toEqual(["question_1_answer", "question_2_answer", "question_3_answer"]);
  expect(out.voiceScript[1].text).toBe("Shark");
  // Emoji choices become Noto images.
  const q3 = flattenElements(scenes[3].elements).map((e) => (e.type === "image" ? e.src : ""));
  expect(q3).toContain("file:emoji/emoji_u1f955.png");
});

it("rejects an odd-one-out item without a valid answer", () => {
  expect(() =>
    compileQuiz({ ...odd, items: [...odd.items.slice(0, 2), { choices: ["A", "B", "C"], a: "Z" }] }),
  ).toThrow();
});

it("detects emoji-only text and maps it to Noto file names", () => {
  expect(emojiOnly("🦁👑")).toEqual(["🦁", "👑"]);
  expect(emojiOnly("🦁 lion")).toBeUndefined();
  expect(emojiFile("🗡️")).toBe("emoji/emoji_u1f5e1.png");
  expect(emojiFile("🇫🇷")).toBe("emoji/emoji_u1f1eb_1f1f7.png");
});

it("draws emoji-only stack questions as images", () => {
  const out = compileQuiz({
    mode: "stack",
    items: [{ q: "🚢🧊💔", a: "Titanic" }, { q: "Text", a: "B" }, { q: "C?", a: "C" }],
  });
  const srcs = flattenElements(out.project.scenes[0].elements).flatMap((e) => (e.type === "image" ? [e.src] : []));
  expect(srcs).toEqual(expect.arrayContaining(["file:emoji/emoji_u1f6a2.png", "file:emoji/emoji_u1f494.png"]));
  expect(flattenElements(out.project.scenes[0].elements).some((e) => e.id === "question")).toBe(false);
});
