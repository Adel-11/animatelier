import { describe, it, expect } from "vitest";
import { demoProject, parseProject, newActor } from "../packages/core/schema";
import { newElement, elementSchema } from "../packages/core/elements";
import { applyCommands, ProjectStore } from "../packages/core/commands";
import { interpolate } from "../packages/core/keyframes";
import { elementStates } from "../packages/core/element-state";
import { getStateAt, agentSchema } from "../packages/core/agent";
import { poseAt } from "../packages/core/engine";
import { renderProjectSvg } from "../packages/renderer/svg";

describe("Format v2 et images clés", () => {
  it("interpôle avec les cinq easings et aux frontières exactes", () => {
    const evaluate = (
      ease: "linear" | "easeIn" | "easeOut" | "easeInOut" | "step",
      time: number,
    ) =>
      interpolate(
        [
          { t: 0, v: 0 },
          { t: 4, v: 100, ease },
        ],
        time,
      );
    expect(evaluate("linear", 1)).toBe(25);
    expect(evaluate("easeIn", 1)).toBe(6.25);
    expect(evaluate("easeOut", 1)).toBe(43.75);
    expect(evaluate("easeInOut", 1)).toBe(12.5);
    expect(evaluate("easeInOut", 3)).toBe(87.5);
    expect(evaluate("step", 3.99)).toBe(0);
    expect(evaluate("step", 4)).toBe(100);
    expect(evaluate("linear", -5)).toBe(0);
    expect(evaluate("linear", 99)).toBe(100);
    expect(interpolate([{ t: 2, v: 42 }], 3)).toBe(42);
  });
  it("compose les pivots et groupes sans dépendre de la lecture", () => {
    const rectangle = newElement("rect", 8, {
      id: "rect",
      x: 10,
      y: 20,
      w: 100,
      h: 100,
      anchor: { x: 0, y: 100 },
      keyframes: {
        rotation: [
          { t: 0, v: 0 },
          { t: 4, v: -70, ease: "easeInOut" },
        ],
      },
    });
    const group = newElement("group", 8, {
      x: 200,
      y: 100,
      scale: 2,
      children: [rectangle],
    });
    const state = elementStates([group], 2)[0].children[0];
    expect(state.element.rotation).toBe(-35);
    // The lower-left pivot is invariant under the child's rotation.
    const m = state.worldTransform;
    expect(m[2] * 100 + m[4]).toBeCloseTo(220);
    expect(m[3] * 100 + m[5]).toBeCloseTo(340);
    elementStates([group], 7);
    expect(elementStates([group], 2)[0].children[0]).toEqual(state);
    expect(
      elementStates([{ ...group, start: 3 }], 2)[0].children[0].visible,
    ).toBe(false);
  });
  it("rejette pistes inconnues, bornes invalides, temps dupliqués et groupes excessifs", () => {
    const rect = newElement("rect", 8);
    for (const keyframes of [
      { fontSize: [{ t: 0, v: 10 }] },
      { constructor: [{ t: 0, v: 10 }] },
      { opacity: [{ t: 0, v: 2 }] },
      {
        rotation: [
          { t: 1, v: 0 },
          { t: 1, v: 5 },
        ],
      },
    ])
      expect(() => elementSchema.parse({ ...rect, keyframes })).toThrow();
    const project = demoProject();
    project.scenes[0].elements = [
      { ...rect, keyframes: { rotation: [{ t: 9, v: 10 }] } },
    ];
    expect(() => parseProject(project)).toThrow(/piste/);
    const cyclic: any = { ...newElement("group", 8) };
    cyclic.children = [cyclic];
    expect(() => elementSchema.parse(cyclic)).toThrow(/huit niveaux/);
    project.scenes[0].elements = Array.from({ length: 201 }, (_, i) => ({
      ...rect,
      id: `rect_${i}`,
    }));
    expect(() => parseProject(project)).toThrow(/200/);
    expect(() => parseProject({ ...demoProject(), schemaVersion: 1 })).toThrow(
      /v1 non pris en charge/,
    );
  });
  it("édite un enfant, rejette les collisions et annule un groupe atomiquement", () => {
    const project = demoProject(),
      sceneId = project.scenes[0].id;
    const group = newElement("group", 8, { id: "group", children: [] });
    const rect = newElement("rect", 8, { id: "child" });
    const store = new ProjectStore(project);
    store.dispatch([
      { type: "element.add", sceneId, element: group },
      { type: "element.add", sceneId, parentId: "group", element: rect },
    ]);
    const before = store.get();
    expect(() =>
      store.dispatch([
        { type: "project.rename", name: "Échec" },
        { type: "element.add", sceneId, element: rect },
      ]),
    ).toThrow(/dupliqués/);
    expect(store.get()).toEqual(before);
    store.dispatch([
      { type: "element.replace", sceneId, element: { ...rect, x: 42 } },
    ]);
    expect(getStateAt(store.get(), 0).elements[0].children[0].element.x).toBe(
      42,
    );
    store.dispatch([{ type: "element.remove", sceneId, elementId: "group" }]);
    expect(store.get().scenes[0].elements).toHaveLength(0);
    expect(store.undo().scenes[0].elements).toHaveLength(1);
    expect(() =>
      applyCommands(project, [
        { type: "element.add", sceneId, parentId: "missing", element: rect },
      ]),
    ).toThrow(/Groupe introuvable/);
  });
  it("rend textes échappés, ordre des couches et état animé commun au SVG", () => {
    const project = demoProject();
    project.scenes[0].actors = [];
    project.scenes[0].elements = [
      newElement("text", 8, { id: "text", text: '<script>"&', z: 2 }),
      newElement("rect", 8, {
        id: "rect",
        keyframes: {
          w: [
            { t: 0, v: 0 },
            { t: 8, v: 200 },
          ],
        },
      }),
    ];
    const svg = renderProjectSvg(project, 4);
    expect(svg).toContain('width="100"');
    expect(svg).toContain("&lt;script&gt;&quot;&amp;");
    expect(svg.indexOf('data-element-id="rect"')).toBeLessThan(
      svg.indexOf('data-element-id="text"'),
    );
    expect(getStateAt(project, 4).elements[1].element).toMatchObject({
      w: 100,
    });
    expect(renderProjectSvg(project, 4)).toBe(svg);
  });
  it("anime les personnages et donne priorité à x sur moveX", () => {
    const actor = newActor(8, {
      x: 100,
      moveX: 400,
      keyframes: {
        x: [
          { t: 0, v: -100 },
          { t: 8, v: 300 },
        ],
        rotation: [
          { t: 0, v: 0 },
          { t: 8, v: 90 },
        ],
        opacity: [
          { t: 0, v: 0 },
          { t: 8, v: 1 },
        ],
      },
    });
    expect(poseAt(actor, 4)).toMatchObject({
      x: 100,
      rotation: 45,
      opacity: 0.5,
    });
    expect(poseAt(newActor(8, { x: 100, moveX: 400 }), 4).x).toBe(300);
  });
  it("publie un schéma récursif et un exemple valide par type", () => {
    const schema = agentSchema();
    for (const example of Object.values(schema.examples))
      expect(elementSchema.safeParse(example).success).toBe(true);
    expect(JSON.stringify(schema.project)).toContain('"group"');
    expect(JSON.stringify(schema.project)).toContain('"$ref"');
  });
});
