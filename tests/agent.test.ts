import { describe, expect, it } from "vitest";
import { demoProject } from "../packages/core/schema";
import {
  agentSchema,
  getStateAt,
  validateProject,
} from "../packages/core/agent";
import { renderProjectSvg } from "../packages/renderer/svg";

describe("Inspection agents", () => {
  it("décrit les enums, bornes et formes des commandes sans perdre les contraintes croisées", () => {
    const schema = agentSchema();
    const project: any = schema.project.definitions!.Project;
    const actor = project.properties.scenes.items.properties.actors.items;
    expect(actor.properties.x).toMatchObject({
      minimum: -10000,
      maximum: 10000,
    });
    expect(actor.properties.action.enum).toContain("walk");
    expect(actor.additionalProperties).toBe(false);
    const commands: any = schema.commands.definitions!.Commands;
    expect(commands.maxItems).toBe(100);
    expect(commands.items.anyOf).toHaveLength(10);
    expect(schema.constraints).toContain("end > start");
  });
  it("valide sans mutation et retourne les chemins des erreurs Zod", () => {
    const project = demoProject();
    const original = structuredClone(project);
    expect(validateProject(project)).toMatchObject({ ok: true, duration: 8 });
    expect(project).toEqual(original);
    project.scenes[0].actors[0].scale = -1;
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    expect(result.errors[0].path).toEqual(["scenes", 0, "actors", 0, "scale"]);
    project.scenes[0].actors[0].scale = 1;
    project.scenes[0].actors[0].end = 9;
    expect(validateProject(project).ok).toBe(false);
  });
  it("calcule le même état que le rendu et conserve les frontières v1", () => {
    const project = demoProject();
    const actor = project.scenes[0].actors[0];
    Object.assign(actor, {
      x: 100,
      moveX: 400,
      action: "walk",
      start: 2,
      end: 6,
      dialogue: "Bonjour",
    });
    const state = getStateAt(project, 4);
    expect(state.actors[0]).toMatchObject({
      x: 300,
      visible: true,
      dialogue: "Bonjour",
      action: "walk",
    });
    expect(renderProjectSvg(project, 4)).toContain('cx="300"');
    expect(getStateAt(project, 1).actors[0]).toMatchObject({
      visible: false,
      dialogue: "",
    });
    expect(getStateAt(project, 6).actors[0].visible).toBe(true);
    expect(getStateAt(project, 6.01).actors[0].visible).toBe(false);
    project.scenes.push({
      ...structuredClone(project.scenes[0]),
      id: "second",
    });
    expect(getStateAt(project, 8).scene).toMatchObject({
      id: "second",
      time: 0,
    });
    expect(getStateAt(project, 100).time).toBe(16);
    expect(() => getStateAt(project, NaN)).toThrow("Temps invalide");
  });
});
