import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { projectSchema, type Project } from "./schema";
import { commandSchema } from "./commands";
import { clamp, locateTime, poseAt, totalDuration } from "./engine";

export function agentSchema() {
  return {
    project: zodToJsonSchema(projectSchema, {
      name: "Project",
      $refStrategy: "none",
    }),
    commands: zodToJsonSchema(z.array(commandSchema).max(100), {
      name: "Commands",
      $refStrategy: "none",
    }),
    units: {
      x: "pixels, position des pieds",
      y: "pixels vers le bas, position des pieds",
      scale: "multiplicateur",
      moveX: "déplacement total en pixels",
      start: "secondes relatives à la scène",
      end: "secondes relatives à la scène",
      time: "secondes globales au projet",
    },
    constraints: [
      "end > start",
      "end <= durée de scène",
      "IDs de scènes uniques dans le projet",
      "IDs de personnages uniques dans chaque scène",
      "Les remplacements exigent un objet complet",
      "Un lot est atomique",
    ],
    note: "Les contraintes entre champs ne sont pas exprimables en JSON Schema draft-07 : utiliser validate().",
  };
}

export function projectWarnings(project: Project): string[] {
  const warnings = new Set<string>();
  for (const scene of project.scenes)
    for (const actor of scene.actors) {
      if (actor.x + actor.moveX < 0 || actor.x + actor.moveX > project.width)
        warnings.add("Au moins un personnage termine hors du cadre.");
      if (actor.dialogue && actor.action !== "talk")
        warnings.add(
          "Une bulle est présente sans animation de parole (action talk).",
        );
    }
  return [...warnings];
}

export function validateProject(input: unknown) {
  const result = projectSchema.safeParse(input);
  return result.success
    ? {
        ok: true as const,
        duration: totalDuration(result.data),
        warnings: projectWarnings(result.data),
        errors: [],
      }
    : {
        ok: false as const,
        duration: null,
        warnings: [] as string[],
        errors: result.error.issues,
      };
}

export function getStateAt(project: Project, time: number) {
  const located = locateTime(project, time);
  return {
    time: clamp(time, 0, totalDuration(project)),
    duration: totalDuration(project),
    scene: {
      id: located.scene.id,
      name: located.scene.name,
      index: located.index,
      time: located.time,
      background: located.scene.background,
      title: located.scene.title,
    },
    actors: located.scene.actors.map((actor) => {
      const pose = poseAt(actor, located.time);
      return {
        id: actor.id,
        name: actor.name,
        ...pose,
        action: actor.action,
        dialogue: pose.visible ? actor.dialogue : "",
        facing: actor.flip ? ("left" as const) : ("right" as const),
        scale: actor.scale,
      };
    }),
  };
}

export function mutationResult(project: Project) {
  return {
    ok: true as const,
    project,
    duration: totalDuration(project),
    warnings: projectWarnings(project),
  };
}
