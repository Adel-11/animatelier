import { z } from "zod";
import {
  elementSchema,
  findElementContainer,
  flattenElements,
} from "./elements";
import {
  actorSchema,
  sceneSchema,
  projectSchema,
  type Project,
} from "./schema";

export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("element.add"),
      sceneId: z.string(),
      parentId: z.string().optional(),
      element: elementSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("element.replace"),
      sceneId: z.string(),
      element: elementSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("element.remove"),
      sceneId: z.string(),
      elementId: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("project.rename"),
      name: z.string().min(1).max(100),
    })
    .strict(),
  z.object({ type: z.literal("scene.add"), scene: sceneSchema }).strict(),
  z.object({ type: z.literal("scene.replace"), scene: sceneSchema }).strict(),
  z.object({ type: z.literal("scene.remove"), sceneId: z.string() }).strict(),
  z
    .object({
      type: z.literal("actor.add"),
      sceneId: z.string(),
      actor: actorSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("actor.replace"),
      sceneId: z.string(),
      actor: actorSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("actor.remove"),
      sceneId: z.string(),
      actorId: z.string(),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export function applyCommands(project: Project, input: unknown[]): Project {
  if (input.length > 100) throw new Error("Maximum 100 commandes par lot.");
  const next = structuredClone(project);
  for (const raw of input) {
    const cmd = commandSchema.parse(raw);
    if (cmd.type === "project.rename") {
      next.name = cmd.name;
      continue;
    }
    if (cmd.type === "scene.add") {
      next.scenes.push(cmd.scene);
      continue;
    }
    const sceneId = cmd.type === "scene.replace" ? cmd.scene.id : cmd.sceneId;
    const index = next.scenes.findIndex((s) => s.id === sceneId);
    if (index < 0) throw new Error(`Scène introuvable : ${sceneId}`);
    if (cmd.type === "scene.replace") {
      next.scenes[index] = cmd.scene;
      continue;
    }
    if (cmd.type === "scene.remove") {
      next.scenes.splice(index, 1);
      continue;
    }
    const scene = next.scenes[index];
    if (cmd.type === "element.add") {
      let destination = scene.elements;
      if (cmd.parentId) {
        const parent = flattenElements(scene.elements).find(
          (e) => e.id === cmd.parentId,
        );
        if (!parent || parent.type !== "group")
          throw new Error(`Groupe introuvable : ${cmd.parentId}`);
        destination = parent.children;
      }
      destination.push(cmd.element);
      continue;
    }
    if (cmd.type === "element.replace" || cmd.type === "element.remove") {
      const id =
        cmd.type === "element.replace" ? cmd.element.id : cmd.elementId;
      const container = findElementContainer(scene.elements, id);
      if (!container) throw new Error(`Élément introuvable : ${id}`);
      const index = container.findIndex((e) => e.id === id);
      if (cmd.type === "element.replace") container[index] = cmd.element;
      else container.splice(index, 1);
      continue;
    }
    if (cmd.type === "actor.add") scene.actors.push(cmd.actor);
    else {
      const actorId = cmd.type === "actor.replace" ? cmd.actor.id : cmd.actorId;
      const ai = scene.actors.findIndex((a) => a.id === actorId);
      if (ai < 0) throw new Error(`Personnage introuvable : ${actorId}`);
      if (cmd.type === "actor.remove") scene.actors.splice(ai, 1);
      else scene.actors[ai] = cmd.actor;
    }
  }
  return projectSchema.parse(next);
}
export class ProjectStore {
  private past: Project[] = [];
  private future: Project[] = [];
  private current: Project;
  constructor(project: Project) {
    this.current = projectSchema.parse(project);
  }
  get() {
    return structuredClone(this.current);
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  replace(project: unknown) {
    const next = projectSchema.parse(project);
    this.past.push(this.current);
    if (this.past.length > 100) this.past.shift();
    this.current = next;
    this.future = [];
    return this.get();
  }
  dispatch(commands: unknown[]) {
    return this.replace(applyCommands(this.current, commands));
  }
  undo() {
    const p = this.past.pop();
    if (p) {
      this.future.push(this.current);
      this.current = p;
    }
    return this.get();
  }
  redo() {
    const p = this.future.pop();
    if (p) {
      this.past.push(this.current);
      this.current = p;
    }
    return this.get();
  }
}
