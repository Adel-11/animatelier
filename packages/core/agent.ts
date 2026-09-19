import { motionGuide } from "./motion-guide";
import { quizSchema, quizExamples } from "./quiz";
import { quizGuide } from "./quiz-guide";
import { z } from "zod";
import { sceneElementStates } from "./scene-state";
import { handMatrix } from "./rig";
import { elementTypes, newElement } from "./elements";
import { zodToJsonSchema } from "zod-to-json-schema";
import { projectSchema, type Project } from "./schema";
import { commandSchema } from "./commands";
import { clamp, locateTime, poseAt, totalDuration } from "./engine";

export function agentSchema() {
  return {
    motion: { guide: motionGuide },
    quiz: {
      schema: zodToJsonSchema(quizSchema, {
        name: "Quiz",
        $refStrategy: "root",
      }),
      examples: structuredClone(quizExamples),
      guide: quizGuide,
    },
    project: zodToJsonSchema(projectSchema, {
      name: "Project",
      $refStrategy: "root",
    }),
    commands: zodToJsonSchema(z.array(commandSchema).max(100), {
      name: "Commands",
      $refStrategy: "root",
    }),
    examples: Object.fromEntries(
      elementTypes.map((type) => [
        type,
        newElement(type, 8, { id: `example_${type}` }),
      ]),
    ),
    units: {
      x: "pixels locaux ; pieds pour les personnages, origine locale pour les éléments",
      y: "pixels locaux vers le bas",
      scale: "multiplicateur",
      moveX: "déplacement total en pixels",
      start: "secondes relatives à la scène",
      end: "secondes relatives à la scène",
      time: "secondes globales au projet",
      keyframes:
        "t en secondes de scène ; ease sur la clé d’arrivée ; propriété inconnue rejetée",
      anchor:
        "pivot en pixels locaux, transformation T(x,y) T(anchor) R S T(-anchor)",
    },
    constraints: [
      "timeline : segments triés sans chevauchement dans la présence du personnage ; toX absolu ; keyframes.x prioritaire",
      "attachment : élément racine vers une main d’un personnage de la même scène",
      "wobble : sinusoïde additionnelle, frequency en Hz, phase en degrés, résultat borné",
      "end > start",
      "end <= durée de scène",
      "IDs de scènes uniques dans le projet",
      "IDs uniques pour personnages et éléments dans chaque scène",
      "Maximum 200 éléments, huit niveaux de groupes, 120 clés par piste",
      "Clés triées strictement par temps et limitées à la durée de scène",
      "Les remplacements exigent un objet complet",
      "Un lot est atomique",
      "path : commandes SVG M/L/H/V/C/S/Q/T/A/Z, 500 segments et 16000 caractères maximum ; fill apparaît à draw=1",
      "group.clip : rect, ellipse ou path statique en coordonnées locales",
      "text.number : remplace {n} selon progress ; decimals entre 0 et 6",
    ],
    note: "Les contraintes entre champs ne sont pas exprimables en JSON Schema draft-07 : utiliser validate().",
  };
}

export function projectWarnings(project: Project): string[] {
  const warnings = new Set<string>();
  for (const scene of project.scenes)
    for (const actor of scene.actors) {
      if (
        poseAt(actor, actor.end).x < 0 ||
        poseAt(actor, actor.end).x > project.width
      )
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
    elements: sceneElementStates(located.scene, located.time),
    actors: located.scene.actors.map((actor) => {
      const pose = poseAt(actor, located.time);
      return {
        id: actor.id,
        name: actor.name,
        ...pose,
        hands: {
          left: handMatrix(actor, located.time, "left"),
          right: handMatrix(actor, located.time, "right"),
        },
        facing: actor.flip ? ("left" as const) : ("right" as const),
        scale: pose.scale,
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
