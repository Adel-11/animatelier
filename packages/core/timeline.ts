import type { Project } from "./schema";
import type { SceneElement } from "./elements";
import { totalDuration } from "./engine";
export function projectTimeline(project: Project) {
  const events: { time: number; type: string; sceneId: string; id?: string }[] =
    [];
  let offset = 0;
  for (const scene of project.scenes) {
    const add = (time: number, type: string, id?: string) =>
      events.push({
        time: offset + time,
        type,
        sceneId: scene.id,
        ...(id ? { id } : {}),
      });
    add(0, "scene_start");
    add(scene.duration, "scene_end");
    const visit = (
      elements: SceneElement[],
      start = 0,
      end = scene.duration,
    ) => {
      for (const element of elements) {
        const from = Math.max(start, element.start),
          to = Math.min(end, element.end);
        if (from > to) continue;
        add(from, "element_appear", element.id);
        add(to, "element_disappear", element.id);
        if (element.type === "group") visit(element.children, from, to);
      }
    };
    visit(scene.elements);
    for (const actor of scene.actors) {
      add(actor.start, "actor_appear", actor.id);
      add(actor.end, "actor_disappear", actor.id);
    }
    // Recognize the stable IDs emitted by compileQuiz, including existing v2 exports.
    const timer = scene.elements.find((e) => e.id === "timer");
    const answer = scene.elements.find((e) => e.id === "answer_label");
    if (timer && answer && scene.elements.some((e) => e.id === "question")) {
      add(timer.start, "quiz_countdown_start");
      add(answer.start, "quiz_answer_reveal");
    }
    offset += scene.duration;
  }
  return {
    version: 1,
    duration: totalDuration(project),
    semantics:
      "Presence intervals; opacity, masks and off-canvas positions do not change events. Endpoints follow the core inclusive end convention.",
    events: events.sort((a, b) => a.time - b.time),
  };
}
