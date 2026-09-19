import type { Scene } from "./schema";
import { poseAt } from "./engine";
import { elementStates } from "./element-state";
import { handMatrix } from "./rig";

export function sceneElementStates(scene: Scene, time: number) {
  return scene.elements.map((element) => {
    if (!element.attachment) return elementStates([element], time)[0];
    const actor = scene.actors.find(
      (a) => a.id === element.attachment!.actorId,
    )!;
    const pose = poseAt(actor, time);
    const state = elementStates(
      [element],
      time,
      handMatrix(actor, time, element.attachment.hand),
      pose.visible,
      pose.opacity,
    )[0];
    // Root attachments render in world space; descendants retain their local matrices.
    return {
      ...state,
      transform: state.worldTransform,
      element: {
        ...state.element,
        opacity: state.effectiveOpacity,
        z: state.element.z + pose.z,
      },
    };
  });
}
