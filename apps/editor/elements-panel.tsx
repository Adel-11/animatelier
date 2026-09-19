import React, { useState } from "react";
import type { Scene } from "../../packages/core/schema";
import type { Command } from "../../packages/core/commands";
import {
  elementTypes,
  elementBounds,
  elementSchema,
  flattenElements,
  newElement,
  type SceneElement,
} from "../../packages/core/elements";
import { animated, easings } from "../../packages/core/keyframes";

const labels = {
  rect: "Rectangle",
  path: "Tracé",
  ellipse: "Ellipse",
  line: "Ligne",
  text: "Texte",
  group: "Groupe",
};
export function ElementsPanel({
  scene,
  selected,
  select,
  dispatch,
  time,
  busy,
}: {
  scene: Scene;
  selected: string | null;
  select: (id: string | null) => void;
  dispatch: (commands: Command[]) => void;
  time: number;
  busy: boolean;
}) {
  const node = flattenElements(scene.elements).find((e) => e.id === selected);
  const [error, setError] = useState("");
  const commit = (input: unknown) => {
    try {
      const element = elementSchema.parse(input);
      dispatch([{ type: "element.replace", sceneId: scene.id, element }]);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const list = (elements: SceneElement[], depth = 0): React.ReactNode =>
    elements.map((e) => (
      <React.Fragment key={e.id}>
        <button
          className={`element-row ${e.id === selected ? "chosen" : ""}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => select(e.id)}
          aria-pressed={e.id === selected}
        >
          {labels[e.type]} · {e.id.slice(-8)}
        </button>
        {e.type === "group" && list(e.children, depth + 1)}
      </React.Fragment>
    ));
  return (
    <div className="elements-panel">
      <p className="muted">
        {node?.type === "group"
          ? "Les nouveaux éléments seront ajoutés à ce groupe."
          : "Ajoutez des formes et animez leurs propriétés."}
      </p>
      <div className="element-buttons">
        {elementTypes.map((type) => (
          <button
            key={type}
            disabled={busy}
            onClick={() => {
              const element = newElement(
                type,
                scene.duration,
                node?.type === "group" ? { x: 0, y: 0 } : {},
              );
              dispatch([
                {
                  type: "element.add",
                  sceneId: scene.id,
                  parentId: node?.type === "group" ? node.id : undefined,
                  element,
                },
              ]);
              select(element.id);
            }}
          >
            ＋ {labels[type]}
          </button>
        ))}
      </div>
      <button disabled={busy} onClick={() => select(null)}>
        Ajouter hors du groupe
      </button>
      <div className="element-list" aria-label="Éléments de la scène">
        {list(scene.elements)}
      </div>
      {node && (
        <fieldset disabled={busy} className="element-properties">
          <legend>{labels[node.type]} sélectionné</legend>
          <p className="muted">
            Valeurs de base. Une piste d’images clés a priorité.
          </p>
          {Object.entries(elementBounds[node.type]).map(
            ([property, [min, max]]) => (
              <label className="field" key={property}>
                <span>{property}</span>
                <input
                  aria-label={`Élément ${property}`}
                  type="number"
                  min={min}
                  max={max}
                  step="any"
                  key={`${node.id}-${property}-${(node as any)[property]}`}
                  defaultValue={(node as any)[property]}
                  onBlur={(e) => {
                    if (e.target.value !== "")
                      commit({ ...node, [property]: Number(e.target.value) });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              </label>
            ),
          )}
          {(["start", "end"] as const).map((property) => (
            <label className="field" key={property}>
              <span>{property} (s)</span>
              <input
                aria-label={`Élément ${property}`}
                type="number"
                min="0"
                max={scene.duration}
                step="0.1"
                key={`${node.id}-${property}-${node[property]}`}
                defaultValue={node[property]}
                onBlur={(e) =>
                  commit({ ...node, [property]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          {(["x", "y"] as const).map((axis) => (
            <label className="field" key={axis}>
              <span>Pivot {axis} (px)</span>
              <input
                aria-label={`Pivot ${axis}`}
                type="number"
                key={`${node.id}-anchor-${axis}-${node.anchor[axis]}`}
                defaultValue={node.anchor[axis]}
                onBlur={(e) =>
                  commit({
                    ...node,
                    anchor: { ...node.anchor, [axis]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
          {node.type === "path" && (
            <label className="field">
              Tracé SVG (d)
              <textarea
                aria-label="Tracé SVG"
                key={`${node.id}-${node.d}`}
                defaultValue={node.d}
                onBlur={(e) => commit({ ...node, d: e.target.value })}
              />
            </label>
          )}
          {node.type === "group" && (
            <ClipEditor key={node.id} node={node} commit={commit} />
          )}
          {node.type === "text" && (
            <>
              <label className="field">
                Texte libre
                <textarea
                  aria-label="Texte libre"
                  key={`${node.id}-${node.text}`}
                  defaultValue={node.text}
                  onBlur={(e) => commit({ ...node, text: e.target.value })}
                />
              </label>
              <label className="field">
                Alignement
                <select
                  value={node.align}
                  onChange={(e) => commit({ ...node, align: e.target.value })}
                >
                  {["left", "center", "right"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={node.bold}
                  onChange={(e) => commit({ ...node, bold: e.target.checked })}
                />{" "}
                Gras
              </label>
            </>
          )}
          {node.type === "text" && (
            <section className="keyframe-editor">
              <label>
                <input
                  type="checkbox"
                  checked={!!node.number}
                  onChange={(e) =>
                    commit({
                      ...node,
                      number: e.target.checked
                        ? { from: 0, to: 200, decimals: 0 }
                        : undefined,
                    })
                  }
                />{" "}
                Nombre animé (remplace {"{n}"})
              </label>
              {node.number &&
                (["from", "to", "decimals"] as const).map((property) => (
                  <label className="field" key={property}>
                    {property}
                    <input
                      aria-label={`Compteur ${property}`}
                      type="number"
                      step={property === "decimals" ? 1 : "any"}
                      key={`${node.id}-${property}-${node.number![property]}`}
                      defaultValue={node.number![property]}
                      onBlur={(e) =>
                        commit({
                          ...node,
                          number: {
                            ...node.number,
                            [property]: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ))}
              {node.number && (
                <p className="muted">
                  Écrivez {"{n}"} dans le texte, puis animez progress de 0 à 1
                  dans les images clés.
                </p>
              )}
            </section>
          )}
          {["fill", "stroke", "color"]
            .filter((property) => property in node)
            .map((property) => (
              <label className="field" key={property}>
                {property}
                <input
                  aria-label={`Élément ${property}`}
                  key={`${node.id}-${property}-${(node as any)[property]}`}
                  defaultValue={(node as any)[property]}
                  onBlur={(e) =>
                    commit({ ...node, [property]: e.target.value })
                  }
                />
              </label>
            ))}
          {node.type === "line" && (
            <>
              <label className="field">
                Flèche
                <select
                  value={node.arrow}
                  onChange={(e) => commit({ ...node, arrow: e.target.value })}
                >
                  {["none", "start", "end", "both"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={node.dashed}
                  onChange={(e) =>
                    commit({ ...node, dashed: e.target.checked })
                  }
                />{" "}
                Pointillés
              </label>
            </>
          )}
          <KeyframeEditor
            key={node.id}
            node={node}
            time={time}
            duration={scene.duration}
            commit={commit}
          />
          <button
            className="danger"
            onClick={() => {
              dispatch([
                {
                  type: "element.remove",
                  sceneId: scene.id,
                  elementId: node.id,
                },
              ]);
              select(null);
            }}
          >
            Supprimer l’élément
          </button>
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function KeyframeEditor({
  node,
  time,
  duration,
  commit,
}: {
  node: SceneElement;
  time: number;
  duration: number;
  commit: (node: unknown) => void;
}) {
  const [property, setProperty] = useState("rotation");
  const [ease, setEase] = useState<(typeof easings)[number]>("linear");
  const [value, setValue] = useState(0);
  const [at, setAt] = useState(time);
  return (
    <section className="keyframe-editor">
      <h3>Images clés</h3>
      <label className="field">
        Propriété animée
        <select
          aria-label="Propriété animée"
          value={property}
          onChange={(e) => {
            setProperty(e.target.value);
            setValue(Number((animated(node, time) as any)[e.target.value]));
          }}
        >
          {Object.keys(elementBounds[node.type]).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Temps de clé (s)
        <input
          aria-label="Temps de clé"
          type="number"
          min="0"
          max={duration}
          step="0.01"
          value={at}
          onChange={(e) => setAt(Number(e.target.value))}
        />
      </label>
      <button type="button" onClick={() => setAt(Number(time.toFixed(3)))}>
        Utiliser le temps courant
      </button>
      <label className="field">
        Valeur de clé
        <input
          aria-label="Valeur de clé"
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
      </label>
      <label className="field">
        Interpolation
        <select
          aria-label="Interpolation"
          value={ease}
          onChange={(e) => setEase(e.target.value as typeof ease)}
        >
          {easings.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
      </label>
      <button
        onClick={() =>
          commit({
            ...node,
            keyframes: {
              ...node.keyframes,
              [property]: [
                ...(node.keyframes[property] ?? []).filter((k) => k.t !== at),
                { t: at, v: value, ease },
              ].sort((a, b) => a.t - b.t),
            },
          })
        }
      >
        Enregistrer la clé
      </button>
      {(node.keyframes[property] ?? []).map((k) => (
        <div className="keyframe-row" key={k.t}>
          <span>
            {k.t} s → {k.v} · {k.ease ?? "linear"}
          </span>
          <button
            aria-label={`Supprimer clé ${k.t}`}
            onClick={() => {
              const keyframes = { ...node.keyframes };
              keyframes[property] = keyframes[property].filter(
                (key) => key.t !== k.t,
              );
              if (!keyframes[property].length) delete keyframes[property];
              commit({ ...node, keyframes });
            }}
          >
            ×
          </button>
        </div>
      ))}
    </section>
  );
}

function ClipEditor({
  node,
  commit,
}: {
  node: Extract<SceneElement, { type: "group" }>;
  commit: (node: unknown) => void;
}) {
  const clip = node.clip;
  return (
    <section className="keyframe-editor">
      <h3>Masque du groupe</h3>
      <label className="field">
        Forme du masque
        <select
          aria-label="Forme du masque"
          value={clip?.type ?? "none"}
          onChange={(e) => {
            const type = e.target.value;
            commit({
              ...node,
              clip:
                type === "none"
                  ? undefined
                  : type === "path"
                    ? { type, d: "M0 0 L200 0 L200 200 L0 200 Z" }
                    : {
                        type,
                        x: 0,
                        y: 0,
                        w: 200,
                        h: 200,
                        ...(type === "rect" ? { radius: 0 } : {}),
                      },
            });
          }}
        >
          {["none", "rect", "ellipse", "path"].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      {clip?.type === "path" ? (
        <label className="field">
          Tracé du masque
          <textarea
            aria-label="Tracé du masque"
            key={clip.d}
            defaultValue={clip.d}
            onBlur={(e) =>
              commit({ ...node, clip: { ...clip, d: e.target.value } })
            }
          />
        </label>
      ) : (
        clip &&
        Object.entries(clip)
          .filter(([property]) => property !== "type")
          .map(([property, value]) => (
            <label className="field" key={property}>
              Masque {property}
              <input
                aria-label={`Masque ${property}`}
                type="number"
                step="any"
                key={`${property}-${value}`}
                defaultValue={value}
                onBlur={(e) =>
                  commit({
                    ...node,
                    clip: { ...clip, [property]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))
      )}
    </section>
  );
}
