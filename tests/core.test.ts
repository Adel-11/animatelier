import { describe, it, expect } from "vitest";
import { demoProject, parseProject, newActor } from "../packages/core/schema";
import { applyCommands, ProjectStore } from "../packages/core/commands";
import { locateTime, poseAt } from "../packages/core/engine";
import { renderProjectSvg } from "../packages/renderer/svg";
import referenceProject from "../examples/rencontre-30s.animatelier.json";

describe("Contrats de projet", () => {
  it("ouvre le projet de référence v1 à trois scènes", () => {
    const p = parseProject(referenceProject);
    expect(locateTime(p, 10).scene.id).toBe("scene_travail");
    expect(locateTime(p, 20).scene.id).toBe("scene_finale");
    expect(locateTime(p, 30).time).toBe(10);
  });
  it("refuse les versions inconnues et identifiants dupliqués", () => {
    const p = demoProject();
    expect(() => parseProject({ ...p, schemaVersion: 2 })).toThrow();
    p.scenes.push(structuredClone(p.scenes[0]));
    expect(() => parseProject(p)).toThrow();
  });
  it("ne laisse pas un lot invalide modifier le projet source", () => {
    const p = demoProject();
    const original = structuredClone(p);
    expect(() =>
      applyCommands(p, [
        { type: "project.rename", name: "Changé" },
        { type: "scene.remove", sceneId: p.scenes[0].id },
      ]),
    ).toThrow();
    expect(p).toEqual(original);
  });
  it("refuse une animation qui déborde de la scène", () => {
    const p = demoProject();
    p.scenes[0].actors[0].end = 40;
    expect(() => parseProject(p)).toThrow();
  });
  it("conserve les IDs et données après sauvegarde JSON", () => {
    const p = demoProject();
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("annule un lot entier et invalide redo après une nouvelle modification", () => {
    const s = new ProjectStore(demoProject());
    const original = s.get();
    s.dispatch([{ type: "project.rename", name: "Première" }]);
    expect(s.undo()).toEqual(original);
    expect(s.redo().name).toBe("Première");
    s.undo();
    s.dispatch([{ type: "project.rename", name: "Autre" }]);
    expect(s.canRedo).toBe(false);
  });
});
describe("Moteur déterministe", () => {
  it("passe à la scène suivante à sa frontière et borne le temps final", () => {
    const p = demoProject();
    p.scenes.push({ ...structuredClone(p.scenes[0]), id: "second" });
    expect(locateTime(p, 8).scene.id).toBe("second");
    expect(locateTime(p, 100).time).toBe(8);
    expect(() => locateTime(p, NaN)).toThrow();
  });
  it("calcule directement un mouvement sans historique de lecture", () => {
    const a = newActor(8, { x: 100, moveX: 400, start: 2, action: "walk" });
    const mid = poseAt(a, 5);
    poseAt(a, 7);
    expect(poseAt(a, 5)).toEqual(mid);
    expect(mid.x).toBe(300);
    expect(poseAt(a, 1).visible).toBe(false);
  });
  it("échappe les textes importés et produit toujours le même SVG", () => {
    const p = demoProject();
    p.scenes[0].title = "<script>alert(1)</script>";
    p.scenes[0].actors[0].dialogue = '<img onerror="alert(1)">';
    const svg = renderProjectSvg(p, 2);
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img");
    expect(svg).toContain("&lt;script&gt;");
    expect(renderProjectSvg(p, 2)).toBe(svg);
  });
});
