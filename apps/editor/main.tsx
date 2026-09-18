import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  demoProject,
  newActor,
  parseProject,
  uid,
  actions,
  backgrounds,
  type Actor,
  type Project,
  type Scene,
} from "../../packages/core/schema";
import { ProjectStore, type Command } from "../../packages/core/commands";
import { clamp, locateTime, totalDuration } from "../../packages/core/engine";
import {
  renderSceneSvg,
  renderCharacterSvg,
} from "../../packages/renderer/svg";
import { download, pngFrame } from "./export";
import { createBrowserApi, type BrowserApi } from "./agent-api";
import "./style.css";

const STORAGE = "animatelier.project.v1";
let startupWarning = "";
function initialProject() {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) return parseProject(JSON.parse(saved));
  } catch {
    startupWarning =
      "La sauvegarde locale n’a pas pu être chargée. Exportez vos projets régulièrement.";
  }
  return demoProject();
}
const store = new ProjectStore(initialProject());
const actionNames = {
  idle: "Au repos",
  wave: "Saluer",
  walk: "Marcher",
  talk: "Parler",
  celebrate: "Célébrer",
};
const backgroundNames = {
  studio: "Studio créatif",
  office: "Au bureau",
  park: "Au grand air",
  night: "Après la nuit",
};
const characterPresets: Partial<Actor>[] = [
  { name: "Camille", color: "#8777ee", skin: "#eab894" },
  { name: "Alex", color: "#e99658", skin: "#9c674d" },
  { name: "Sasha", color: "#6c9e96", skin: "#d6a276" },
  { name: "Noa", color: "#ce7494", skin: "#684738" },
];
declare global {
  interface Window {
    animatelier: BrowserApi;
  }
}

function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        key={value}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        onBlur={(e) => {
          const n = Number(e.currentTarget.value);
          if (!e.currentTarget.value || !Number.isFinite(n)) {
            e.currentTarget.value = String(value);
            return;
          }
          const next = clamp(n, min, max);
          if (next !== value) onCommit(next);
          e.currentTarget.value = String(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
function App() {
  const [project, setProject] = useState(store.get());
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(
    project.scenes[0].actors[0]?.id ?? null,
  );
  const [tab, setTab] = useState<"characters" | "sets" | "scenes">(
    "characters",
  );
  const [notice, setNotice] = useState(
    startupWarning || "Votre studio est prêt. À vous de jouer.",
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [apiOpen, setApiOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    actor: Actor;
    sceneId: string;
    px: number;
    py: number;
    scale: number;
  } | null>(null);
  const [dragActor, setDragActor] = useState<Actor | null>(null);
  const duration = totalDuration(project);
  const located = locateTime(project, time);
  const scene = located.scene;
  const actor = scene.actors.find((a) => a.id === selected);
  const previewScene = dragActor
    ? {
        ...scene,
        actors: scene.actors.map((a) =>
          a.id === dragActor.id ? dragActor : a,
        ),
      }
    : scene;
  const sceneStart = project.scenes
    .slice(0, located.index)
    .reduce((n, s) => n + s.duration, 0);
  const report = (e: unknown) =>
    setNotice(e instanceof Error ? e.message : String(e));
  const sync = (p: Project) => {
    setProject(p);
    setTime((t) => Math.min(t, totalDuration(p)));
  };
  const dispatch = (commands: Command[]) => {
    try {
      sync(store.dispatch(commands));
    } catch (e) {
      report(e);
    }
  };
  const updateActor = (patch: Partial<Actor>) => {
    if (actor)
      dispatch([
        {
          type: "actor.replace",
          sceneId: scene.id,
          actor: { ...actor, ...patch },
        },
      ]);
  };
  const updateScene = (patch: Partial<Scene>) =>
    dispatch([{ type: "scene.replace", scene: { ...scene, ...patch } }]);
  const jumpScene = (index: number) => {
    setPlaying(false);
    setTime(project.scenes.slice(0, index).reduce((n, s) => n + s.duration, 0));
    setSelected(null);
  };
  const addActor = (preset: Partial<Actor>) => {
    const a = newActor(scene.duration, {
      ...preset,
      x: 360 + (scene.actors.length % 4) * 170,
    });
    dispatch([{ type: "actor.add", sceneId: scene.id, actor: a }]);
    setSelected(a.id);
  };
  const addScene = () => {
    const next: Scene = {
      id: uid("scene"),
      name: `Scène ${project.scenes.length + 1}`,
      duration: 6,
      background: "studio",
      title: "",
      actors: [],
    };
    dispatch([{ type: "scene.add", scene: next }]);
    setTime(duration);
    setSelected(null);
    setPlaying(false);
  };
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(project));
    } catch {
      setNotice(
        "Sauvegarde locale indisponible : téléchargez le fichier projet.",
      );
    }
  }, [project]);
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const next = t + delta;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, duration]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        ) ||
        busy
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setTime((t) => (t >= duration ? 0 : t));
        setPlaying((p) => !p);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        sync(e.shiftKey ? store.redo() : store.undo());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [duration, busy]);
  useEffect(() => {
    window.animatelier = createBrowserApi(store, {
      sync: (project) => {
        sync(project);
        setSelected(null);
      },
      seek: (t) => {
        if (!Number.isFinite(t)) throw new Error("Temps invalide.");
        setPlaying(false);
        setTime(clamp(t, 0, totalDuration(store.get())));
      },
      busy: setBusy,
      progress: setProgress,
    });
  }, []);
  const exportWebm = async () => {
    try {
      const result = await window.animatelier.exportVideo();
      const link = document.createElement("a");
      link.href = result.url;
      link.download = "animation.webm";
      link.click();
      setTimeout(() => window.animatelier.releaseExport(result.url), 1000);
      setNotice("Vidéo WebM exportée (sans audio).");
    } catch (e) {
      report(e);
    }
  };
  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const f = event.target.files?.[0];
    if (!f) return;
    try {
      if (f.size > 5_000_000)
        throw new Error("Projet trop volumineux (5 Mo maximum).");
      sync(store.replace(JSON.parse(await f.text())));
      setTime(0);
      setSelected(null);
      setPlaying(false);
      setNotice("Projet importé.");
    } catch (e) {
      report(e);
    } finally {
      event.target.value = "";
    }
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setDragActor({
      ...d.actor,
      x: clamp(Math.round(d.actor.x + (e.clientX - d.px) * d.scale), 0, 1280),
      y: clamp(Math.round(d.actor.y + (e.clientY - d.py) * d.scale), 100, 710),
    });
  };
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">A</span> animatelier{" "}
          <span className="alpha">ALPHA</span>
        </div>
        <div className="project-title">
          <span className="saved-dot" />
          {project.name}
          <small>1280 × 720 · 30 i/s</small>
        </div>
        <div className="header-actions">
          <button onClick={() => setApiOpen(true)}>⌘ Agents</button>
          <button disabled={busy} onClick={() => file.current?.click()}>
            Ouvrir
          </button>
          <button
            onClick={() =>
              download(
                new Blob([JSON.stringify(project, null, 2)], {
                  type: "application/json",
                }),
                "projet.animatelier.json",
              )
            }
          >
            Sauvegarder
          </button>
          <button className="primary" disabled={busy} onClick={exportWebm}>
            Exporter la vidéo ↗
          </button>
        </div>
        <input
          ref={file}
          aria-label="Importer un projet"
          type="file"
          accept=".json"
          hidden
          onChange={importFile}
        />
      </header>
      <div className="workspace">
        <nav className="rail" aria-label="Bibliothèque">
          <button
            className={tab === "characters" ? "active" : ""}
            onClick={() => setTab("characters")}
          >
            <b>♙</b>Personnages
          </button>
          <button
            className={tab === "sets" ? "active" : ""}
            onClick={() => setTab("sets")}
          >
            <b>▧</b>Décors
          </button>
          <button
            className={tab === "scenes" ? "active" : ""}
            onClick={() => setTab("scenes")}
          >
            <b>▤</b>Scènes
          </button>
          <div className="rail-bottom">
            A<br />
            <small>v0.1</small>
          </div>
        </nav>
        <aside className="library">
          <div className="panel-heading">
            <h2>
              {tab === "characters"
                ? "Le casting"
                : tab === "sets"
                  ? "Les décors"
                  : "Votre histoire"}
            </h2>
            <span>
              {tab === "characters"
                ? "04"
                : tab === "sets"
                  ? "04"
                  : String(project.scenes.length).padStart(2, "0")}
            </span>
          </div>
          <p className="muted">
            {tab === "characters"
              ? "Des personnages prêts à prendre vie."
              : tab === "sets"
                ? "Changez de cadre en un clic."
                : "Une idée, plusieurs scènes."}
          </p>
          {tab === "characters" && (
            <>
              <div className="character-grid">
                {characterPresets.map((p, i) => (
                  <button
                    className="character-card"
                    aria-label={`Ajouter ${p.name}`}
                    key={p.name}
                    onClick={() => addActor(p)}
                    disabled={busy}
                  >
                    <div
                      className={`character-art art-${i}`}
                      dangerouslySetInnerHTML={{
                        __html: renderCharacterSvg(
                          newActor(1, { ...p, id: "thumb" }),
                        ),
                      }}
                    />
                    <span>
                      {p.name}
                      <b>＋</b>
                    </span>
                  </button>
                ))}
              </div>
              <div className="tip">
                <span>✦</span>
                <strong>Un geste suffit.</strong>
                <p>
                  Ajoutez un personnage, choisissez son mouvement, puis lancez
                  la lecture.
                </p>
              </div>
              <div className="asset-note">
                Illustrations originales · rig 2D intégré
              </div>
            </>
          )}
          {tab === "sets" && (
            <div className="set-list">
              {backgrounds.map((bg) => (
                <button
                  key={bg}
                  className={`set-card ${scene.background === bg ? "chosen" : ""}`}
                  onClick={() => updateScene({ background: bg })}
                  disabled={busy}
                >
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderSceneSvg(
                        { ...scene, background: bg, title: "", actors: [] },
                        0,
                      ),
                    }}
                  />
                  <span>
                    {backgroundNames[bg]} {scene.background === bg ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          {tab === "scenes" && (
            <div className="scene-list">
              {project.scenes.map((s, i) => (
                <button
                  className={scene.id === s.id ? "chosen" : ""}
                  key={s.id}
                  onClick={() => jumpScene(i)}
                >
                  <strong>{String(i + 1).padStart(2, "0")}</strong>
                  <span>
                    {s.name}
                    <small>{s.duration} secondes</small>
                  </span>
                </button>
              ))}
              <button className="outline" onClick={addScene} disabled={busy}>
                ＋ Ajouter une scène
              </button>
            </div>
          )}
        </aside>
        <main className="center">
          <div className="canvas-toolbar">
            <div>
              <span className="eyebrow">
                SCÈNE {String(located.index + 1).padStart(2, "0")}
              </span>
              <strong>{scene.name}</strong>
            </div>
            <div>
              <button
                aria-label="Annuler"
                disabled={!store.canUndo || busy}
                onClick={() => sync(store.undo())}
              >
                ↶
              </button>
              <button
                aria-label="Rétablir"
                disabled={!store.canRedo || busy}
                onClick={() => sync(store.redo())}
              >
                ↷
              </button>
              <span className="divider" />
              <button
                onClick={async () => {
                  try {
                    download(await pngFrame(project, time), "image.png");
                  } catch (e) {
                    report(e);
                  }
                }}
              >
                Image PNG
              </button>
              <span className="ratio">16:9</span>
            </div>
          </div>
          <div className="canvas-area">
            <div
              className="stage"
              ref={stage}
              onPointerDown={(e) => {
                if (busy || playing) return;
                const target = (e.target as Element).closest("[data-actor-id]");
                const id = target?.getAttribute("data-actor-id");
                setSelected(id ?? null);
                const a = scene.actors.find((a) => a.id === id);
                if (!a || !stage.current) return;
                drag.current = {
                  actor: a,
                  sceneId: scene.id,
                  px: e.clientX,
                  py: e.clientY,
                  scale: 1280 / stage.current.getBoundingClientRect().width,
                };
                stage.current.setPointerCapture(e.pointerId);
              }}
              onPointerMove={moveDrag}
              onPointerUp={(e) => {
                const d = drag.current;
                if (d && dragActor)
                  dispatch([
                    {
                      type: "actor.replace",
                      sceneId: d.sceneId,
                      actor: dragActor,
                    },
                  ]);
                drag.current = null;
                setDragActor(null);
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDragActor(null);
              }}
              dangerouslySetInnerHTML={{
                __html: renderSceneSvg(
                  previewScene,
                  located.time,
                  playing ? undefined : (selected ?? undefined),
                ),
              }}
            />
            <div className="canvas-caption">
              <span>
                ✦{" "}
                {playing
                  ? "Votre histoire prend vie"
                  : "Cliquez et glissez un personnage pour le placer"}
              </span>
              <span>HD · 720p</span>
            </div>
          </div>
          <section className="timeline">
            <div className="transport">
              <div className="transport-left">
                <button
                  aria-label="Revenir au début"
                  onClick={() => {
                    setTime(0);
                    setPlaying(false);
                  }}
                >
                  ↤
                </button>
                <button
                  className="play"
                  aria-label={playing ? "Pause" : "Lire"}
                  disabled={busy}
                  onClick={() => {
                    if (time >= duration) setTime(0);
                    setPlaying((p) => !p);
                  }}
                >
                  {playing ? "Ⅱ" : "▶"}
                </button>
                <span className="timecode">
                  {time.toFixed(1).padStart(4, "0")}{" "}
                  <span>/ {duration.toFixed(1)} s</span>
                </span>
              </div>
              <span className="muted">Espace pour lire</span>
              <button className="outline" onClick={addScene} disabled={busy}>
                ＋ Scène
              </button>
            </div>
            <input
              className="scrubber"
              aria-label="Position de lecture"
              type="range"
              min="0"
              max={duration}
              step="0.01"
              value={time}
              onChange={(e) => {
                setPlaying(false);
                setTime(Number(e.target.value));
              }}
            />
            <div className="scene-track">
              <span className="track-label">SCÈNES</span>
              <div className="clips">
                {project.scenes.map((s, i) => (
                  <button
                    key={s.id}
                    style={{ flex: s.duration }}
                    className={`scene-clip ${s.id === scene.id ? "current" : ""}`}
                    onClick={() => jumpScene(i)}
                  >
                    <span>
                      {String(i + 1).padStart(2, "0")} · {s.name}
                    </span>
                    <small>{s.duration}s</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="actor-tracks">
              {scene.actors.map((a) => (
                <div className="actor-track" key={a.id}>
                  <button
                    className="track-label"
                    onClick={() => setSelected(a.id)}
                  >
                    <i style={{ background: a.color }} />
                    {a.name}
                  </button>
                  <div className="track-bed">
                    <button
                      aria-label={`Sélectionner ${a.name}`}
                      className={`actor-clip ${selected === a.id ? "selected" : ""}`}
                      style={{
                        left: `${(a.start / scene.duration) * 100}%`,
                        width: `${((a.end - a.start) / scene.duration) * 100}%`,
                        background: a.color + "33",
                        borderColor: a.color,
                      }}
                      onClick={() => setSelected(a.id)}
                    >
                      {actionNames[a.action]}
                    </button>
                    <div
                      className="playhead"
                      style={{
                        left: `${(located.time / scene.duration) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
        <aside className="inspector">
          <div className="panel-heading">
            <h2>{actor ? "Personnage" : "Scène"}</h2>
            <span>⌁</span>
          </div>
          <div className="selection-title">
            <span
              className="selection-dot"
              style={{ background: actor?.color ?? "#d8ff69" }}
            />
            <strong>{actor?.name ?? scene.name}</strong>
          </div>
          {actor ? (
            <div key={actor.id} className="properties">
              <label className="field">
                <span>Nom</span>
                <input
                  value={actor.name}
                  maxLength={80}
                  onChange={(e) =>
                    updateActor({ name: e.target.value || "Personnage" })
                  }
                />
              </label>
              <h3>TRANSFORMATION</h3>
              <div className="field-row">
                <NumberField
                  label="Position X"
                  value={actor.x}
                  min={0}
                  max={1280}
                  onCommit={(x) => updateActor({ x })}
                />
                <NumberField
                  label="Position Y"
                  value={actor.y}
                  min={100}
                  max={710}
                  onCommit={(y) => updateActor({ y })}
                />
              </div>
              <div className="field-row">
                <NumberField
                  label="Échelle"
                  value={actor.scale}
                  min={0.3}
                  max={2.5}
                  step={0.1}
                  onCommit={(scale) => updateActor({ scale })}
                />
                <label className="field">
                  <span>Vêtement</span>
                  <input
                    aria-label="Couleur du vêtement"
                    type="color"
                    value={actor.color}
                    onChange={(e) => updateActor({ color: e.target.value })}
                  />
                </label>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={actor.flip}
                  onChange={(e) => updateActor({ flip: e.target.checked })}
                />{" "}
                Retourner le personnage
              </label>
              <h3>MOUVEMENT</h3>
              <label className="field">
                <span>Animation</span>
                <select
                  value={actor.action}
                  onChange={(e) =>
                    updateActor({ action: e.target.value as Actor["action"] })
                  }
                >
                  {actions.map((a) => (
                    <option key={a} value={a}>
                      {actionNames[a]}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="Déplacement horizontal (px)"
                value={actor.moveX}
                min={-1000}
                max={1000}
                onCommit={(moveX) => updateActor({ moveX })}
              />
              <div className="field-row">
                <NumberField
                  label="Début (s)"
                  value={actor.start}
                  min={0}
                  max={actor.end - 0.1}
                  step={0.1}
                  onCommit={(start) => updateActor({ start })}
                />
                <NumberField
                  label="Fin (s)"
                  value={actor.end}
                  min={actor.start + 0.1}
                  max={scene.duration}
                  step={0.1}
                  onCommit={(end) => updateActor({ end })}
                />
              </div>
              <h3>DIALOGUE</h3>
              <label className="field">
                <span>Bulle de texte</span>
                <textarea
                  placeholder="Une réplique à partager…"
                  rows={3}
                  maxLength={240}
                  value={actor.dialogue}
                  onChange={(e) => updateActor({ dialogue: e.target.value })}
                />
              </label>
              <p className="muted small">
                Animation de bouche illustrative, sans voix ni synchronisation
                audio.
              </p>
              <div className="button-row">
                <button
                  onClick={() =>
                    addActor({
                      ...actor,
                      id: uid("actor"),
                      name: actor.name + " copie",
                      x: clamp(actor.x + 120, 0, 1280),
                    })
                  }
                >
                  Dupliquer
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    dispatch([
                      {
                        type: "actor.remove",
                        sceneId: scene.id,
                        actorId: actor.id,
                      },
                    ]);
                    setSelected(null);
                  }}
                >
                  Supprimer
                </button>
              </div>
              <button className="back-link" onClick={() => setSelected(null)}>
                ← Propriétés de la scène
              </button>
            </div>
          ) : (
            <div className="properties" key={scene.id}>
              <label className="field">
                <span>Nom du projet</span>
                <input
                  value={project.name}
                  maxLength={100}
                  onChange={(e) =>
                    dispatch([
                      {
                        type: "project.rename",
                        name: e.target.value || "Mon projet",
                      },
                    ])
                  }
                />
              </label>
              <label className="field">
                <span>Nom de la scène</span>
                <input
                  value={scene.name}
                  maxLength={80}
                  onChange={(e) =>
                    updateScene({ name: e.target.value || "Scène" })
                  }
                />
              </label>
              <label className="field">
                <span>Titre à l’écran</span>
                <textarea
                  rows={3}
                  value={scene.title}
                  maxLength={120}
                  onChange={(e) => updateScene({ title: e.target.value })}
                />
              </label>
              <NumberField
                label="Durée (secondes)"
                value={scene.duration}
                min={1}
                max={120}
                onCommit={(d) => {
                  updateScene({
                    duration: d,
                    actors: scene.actors.map((a) => ({
                      ...a,
                      start: Math.min(a.start, d - 0.1),
                      end: Math.min(a.end, d),
                    })),
                  });
                  setTime(sceneStart);
                }}
              />
              <label className="field">
                <span>Décor</span>
                <select
                  value={scene.background}
                  onChange={(e) =>
                    updateScene({
                      background: e.target.value as Scene["background"],
                    })
                  }
                >
                  {backgrounds.map((b) => (
                    <option value={b} key={b}>
                      {backgroundNames[b]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="danger"
                disabled={project.scenes.length < 2}
                onClick={() => {
                  dispatch([{ type: "scene.remove", sceneId: scene.id }]);
                  setTime(0);
                }}
              >
                Supprimer la scène
              </button>
              <div className="tip">
                <strong>Un projet qui vous appartient.</strong>
                <p>
                  Votre travail est enregistré dans ce navigateur. Téléchargez
                  le fichier JSON pour le partager ou le conserver.
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
      <footer className="statusbar">
        <span role="status">{notice}</span>
        <span>Local · aucune donnée envoyée</span>
      </footer>
      {busy && (
        <div className="overlay">
          <div className="modal">
            <span className="eyebrow">EXPORT WEBM</span>
            <h2>Votre histoire se met en mouvement.</h2>
            <p>
              Gardez cet onglet visible. L’export se fait en temps réel, sans
              audio.
            </p>
            <progress max={1} value={progress} />
            <p>{Math.round(progress * 100)} %</p>
            <button onClick={() => window.animatelier.cancelExport()}>
              Annuler l’export
            </button>
          </div>
        </div>
      )}
      {apiOpen && (
        <div className="overlay" onClick={() => setApiOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Interface agents"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="eyebrow">UN STUDIO POUR LES AGENTS</span>
            <h2>Créer. Observer. Ajuster.</h2>
            <p>
              L’API locale du navigateur partage les commandes de l’éditeur. Le
              serveur MCP fourni dans le dépôt permet aussi de créer des projets
              et de retourner des aperçus PNG aux agents.
            </p>
            <pre>{`const api = window.animatelier;
api.help(); // méthodes, unités, limites et JSON Schema
api.validate(projet); // vérifier sans charger
const résultat = api.load(projet); // ok, project, duration, warnings
api.getStateAt(2); // positions, visibilité, actions et bulles
api.saveAs("Mon histoire — variante");
// await api.exportVideo(); puis api.getExportState()`}</pre>
            <details>
              <summary>Référence complète de l’API</summary>
              <pre
                style={{
                  maxHeight: 260,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {JSON.stringify(window.animatelier.help(), null, 2)}
              </pre>
            </details>
            <p className="muted">
              API navigateur v2 : apply et load renvoient un résultat contenant
              project. Projets JSON v1 conservés. Les copies save/saveAs restent
              locales au navigateur. Exportez aussi votre JSON avec «
              Sauvegarder ». Le MCP possède toujours sa propre session ; aucun
              pont live.
            </p>
            <button
              className="primary"
              autoFocus
              onClick={() => setApiOpen(false)}
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
