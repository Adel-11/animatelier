import { expect, it } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { newActor, demoProject, parseProject } from "../packages/core/schema";
import { newElement, elementSchema } from "../packages/core/elements";
import { poseAt } from "../packages/core/engine";
import { getStateAt } from "../packages/core/agent";
import { applyCommands } from "../packages/core/commands";
import { animated } from "../packages/core/keyframes";
import { renderProjectSvg } from "../packages/renderer/svg";
import { motionGuide } from "../packages/core/motion-guide";

const clips = [
  { start: 0, end: 2, action: "walk" as const, toX: 620, dialogue: "" },
  { start: 2, end: 4, action: "hold" as const, dialogue: "Bonjour" },
  { start: 4, end: 6, action: "point" as const, dialogue: "Là" },
  { start: 6, end: 8, action: "walk" as const, toX: 900, dialogue: "" },
];
it("enchaîne mouvements et répliques sans saut de position, clés x prioritaires", () => {
  const a = newActor(8, { x: 400, moveX: 999, timeline: clips });
  expect(poseAt(a, 1)).toMatchObject({ x: 510, action: "walk", dialogue: "" });
  expect(poseAt(a, 2)).toMatchObject({
    x: 620,
    action: "hold",
    dialogue: "Bonjour",
  });
  expect(poseAt(a, 2.1).mouth).toBeGreaterThan(3);
  expect(poseAt(a, 4)).toMatchObject({ x: 620, action: "point" });
  expect(poseAt(a, 7).x).toBe(760);
  expect(poseAt(a, 8)).toMatchObject({ x: 900, action: "walk" });
  expect(poseAt(a, 8.1).visible).toBe(false);
  expect(poseAt({ ...a, keyframes: { x: [{ t: 0, v: 100 }] } }, 7).x).toBe(100);
  expect(
    poseAt({ ...a, timeline: [clips[1]], action: "idle", dialogue: "Base" }, 4),
  ).toMatchObject({ action: "idle", dialogue: "Base" });
  expect(poseAt(a, 1)).toEqual(poseAt(a, 1));
});

it("rejette chevauchements et références invalides, suppression atomique", () => {
  expect(() => newActor(8, { timeline: [clips[1], clips[0]] })).toThrow();
  expect(() => newActor(8, { timeline: [{ ...clips[0], end: 9 }] })).toThrow();
  expect(() => newActor(8, { timeline: [{ ...clips[0], end: 0 }] })).toThrow();
  const p = demoProject(),
    scene = p.scenes[0],
    actor = scene.actors[0];
  scene.elements = [
    newElement("rect", 8, {
      id: "prop",
      attachment: { actorId: actor.id, hand: "right" },
    }),
  ];
  expect(() =>
    applyCommands(p, [
      { type: "actor.remove", sceneId: scene.id, actorId: actor.id },
    ]),
  ).toThrow();
  expect(p.scenes[0].actors).toHaveLength(2);
  const removed = applyCommands(p, [
    { type: "actor.remove", sceneId: scene.id, actorId: actor.id },
    { type: "element.remove", sceneId: scene.id, elementId: "prop" },
  ]);
  expect(removed.scenes[0].actors).toHaveLength(1);
  scene.elements = [newElement("group", 8, { children: scene.elements })];
  expect(() => parseProject(p)).toThrow(/racines/);
});

it("calcule une oscillation après les clés, borne le résultat et rejette les propriétés inconnues", () => {
  const a = newActor(8, {
    rotation: 10,
    opacity: 0.5,
    wobble: {
      rotation: { amplitude: 4, frequency: 1, phase: 0 },
      opacity: { amplitude: 1, frequency: 1, phase: 0 },
    },
  });
  expect(poseAt(a, 0.25).rotation).toBeCloseTo(14);
  expect(poseAt(a, 0.25).opacity).toBe(1);
  expect(poseAt(a, 0.75).opacity).toBe(0);
  expect(
    poseAt({ ...a, keyframes: { rotation: [{ t: 0, v: 20 }] } }, 0.25).rotation,
  ).toBeCloseTo(24);
  expect(() =>
    elementSchema.parse({
      ...newElement("rect", 8),
      wobble: { constructor: { amplitude: 2, frequency: 1 } },
    }),
  ).toThrow();
  expect(animated(newElement("rect", 8), 0)).toMatchObject({ rotation: 0 });
  expect(motionGuide).toBe(
    readFileSync("docs/PERSONNAGES.md", "utf8").replaceAll("\r\n", "\n"),
  );
});

it("la main et l’objet partagent leurs matrices, opacité et visibilité, y compris retournés", async () => {
  for (const flip of [false, true]) {
    const p = demoProject(),
      scene = p.scenes[0];
    const a = newActor(8, {
      id: "holder",
      x: 640,
      y: 500,
      action: "point",
      flip,
      scale: 0.8,
      rotation: 12,
      dialogue: "",
    });
    scene.actors = [a];
    scene.elements = [
      newElement("rect", 8, {
        id: "prop",
        x: -10,
        y: -10,
        w: 20,
        h: 20,
        fill: "#ff0000",
        attachment: { actorId: a.id, hand: "right" },
      }),
    ];
    const state = getStateAt(p, 1),
      m = state.actors[0].hands.right,
      e = state.elements[0];
    expect(
      e.worldTransform[4] + 10 * e.worldTransform[0] + 10 * e.worldTransform[2],
    ).toBeCloseTo(m[4]);
    expect(
      e.worldTransform[5] + 10 * e.worldTransform[1] + 10 * e.worldTransform[3],
    ).toBeCloseTo(m[5]);
    const { data, info } = await sharp(Buffer.from(renderProjectSvg(p, 1)))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const offset = (Math.round(m[5]) * info.width + Math.round(m[4])) * 3;
    expect([...data.subarray(offset, offset + 3)]).toEqual([255, 0, 0]);
    a.opacity = 0.5;
    expect(getStateAt(p, 1).elements[0].effectiveOpacity).toBe(0.5);
    a.start = 2;
    expect(getStateAt(p, 1).elements[0].visible).toBe(false);
  }
});
