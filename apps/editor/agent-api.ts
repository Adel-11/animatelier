import { ProjectStore, type Command } from "../../packages/core/commands";
import { parseProject, uid, type Project } from "../../packages/core/schema";
import {
  agentSchema,
  getStateAt,
  mutationResult,
  validateProject,
} from "../../packages/core/agent";
import { renderProjectSvg } from "../../packages/renderer/svg";
import { exportVideo, pngFrame } from "./export";

const SAVED = "animatelier.saved.v2.";
type ExportState = {
  status: "idle" | "running" | "done" | "cancelled" | "error";
  progress: number;
  url?: string;
  error?: string;
};

export function createBrowserApi(
  store: ProjectStore,
  ui: {
    sync: (project: Project) => void;
    seek: (time: number) => void;
    busy: (value: boolean) => void;
    progress: (value: number) => void;
  },
) {
  let controller: AbortController | null = null;
  let state: ExportState = { status: "idle", progress: 0 };
  const urls = new Set<string>();
  const editable = () => {
    if (controller) throw new Error("Export en cours.");
  };
  const change = (project: Project) => {
    ui.sync(project);
    return mutationResult(project);
  };
  const api = {
    help: () => ({
      apiVersion: 2,
      schemaVersion: 2,
      methods: {
        help: "help() : documentation et schémas",
        schema:
          "schema() : JSON Schema du projet et des commandes, unités et contraintes",
        getProject: "getProject() : copie du projet v2",
        validate:
          "validate(project) : {ok, duration, warnings, errors}, sans mutation",
        apply:
          "apply(commands) : {ok, project, duration, warnings}, erreurs Zod conservées",
        load: "load(project) : même résultat que apply ; réinitialise la lecture",
        getStateAt:
          "getStateAt(time) : scène et personnages calculés, y compris ceux dont visible=false",
        seek: "seek(time) : arrêter la lecture et afficher cet instant",
        renderSvg: "renderSvg(time) : texte SVG",
        renderPng: "await renderPng(time) : Blob PNG",
        save: "save() : sauvegarde locale du projet courant par ID",
        saveAs:
          "saveAs(name) : nouvelle copie locale avec nouvel ID, devient le projet courant",
        listSaved: "listSaved() : copies locales disponibles",
        openSaved: "openSaved(id) : charger une copie locale validée",
        exportVideo:
          "await exportVideo() : {ok, url, mimeType, size, duration} ; WebM silencieux en temps réel",
        getExportState:
          "getExportState() : {status, progress, url?, error?}, progress de 0 à 1",
        cancelExport: "cancelExport() : annuler l’export en cours",
        releaseExport:
          "releaseExport(url) : libérer une URL après récupération",
      },
      example: [{ type: "project.rename", name: "Mon histoire" }],
      limits: [
        "Pas de pont MCP live",
        "Stockage limité à ce navigateur et cette origine",
        "Exporter aussi le JSON pour une sauvegarde durable",
        "Garder l’onglet visible pendant l’export vidéo",
        "URL blob locale à la page, non partageable sur Internet",
        "apply retourne désormais une enveloppe : utiliser result.project",
      ],
      ...agentSchema(),
    }),
    schema: agentSchema,
    validate: validateProject,
    getProject: () => store.get(),
    getStateAt: (time: number) => getStateAt(store.get(), time),
    apply: (commands: Command[]) => {
      editable();
      return change(store.dispatch(commands));
    },
    load: (project: unknown) => {
      editable();
      const result = change(store.replace(project));
      ui.seek(0);
      return result;
    },
    seek: (time: number) => {
      editable();
      ui.seek(time);
    },
    renderSvg: (time: number) => renderProjectSvg(store.get(), time),
    renderPng: (time: number) => pngFrame(store.get(), time),
    save: () => {
      editable();
      const project = store.get();
      localStorage.setItem(SAVED + project.id, JSON.stringify(project));
      return {
        ...mutationResult(project),
        id: project.id,
        storage: "localStorage" as const,
      };
    },
    saveAs: (name: string) => {
      editable();
      const project = parseProject({
        ...store.get(),
        id: uid("project"),
        name,
      });
      localStorage.setItem(SAVED + project.id, JSON.stringify(project));
      return {
        ...change(store.replace(project)),
        id: project.id,
        storage: "localStorage" as const,
      };
    },
    listSaved: () => {
      const projects: { id: string; name: string }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (!key.startsWith(SAVED)) continue;
        try {
          const p = parseProject(JSON.parse(localStorage.getItem(key)!));
          projects.push({ id: p.id, name: p.name });
        } catch {
          /* Ignore damaged entries without deleting them. */
        }
      }
      return projects;
    },
    openSaved: (id: string) => {
      editable();
      const value = localStorage.getItem(SAVED + id);
      if (!value) throw new Error("Sauvegarde introuvable.");
      return api.load(JSON.parse(value));
    },
    getExportState: () => ({ ...state }),
    cancelExport: () => {
      controller?.abort();
    },
    releaseExport: (url: string) => {
      if (urls.delete(url)) URL.revokeObjectURL(url);
      if (state.url === url) delete state.url;
    },
    exportVideo: async () => {
      editable();
      const project = store.get();
      const active = new AbortController();
      controller = active;
      state = { status: "running", progress: 0 };
      ui.seek(0);
      ui.busy(true);
      ui.progress(0);
      try {
        const blob = await exportVideo(
          project,
          (progress) => {
            state = { status: "running", progress };
            ui.progress(progress);
          },
          active.signal,
        );
        const url = URL.createObjectURL(blob);
        urls.add(url);
        state = { status: "done", progress: 1, url };
        return {
          ok: true as const,
          url,
          mimeType: blob.type,
          size: blob.size,
          duration: mutationResult(project).duration,
        };
      } catch (error) {
        state = {
          status: active.signal.aborted ? "cancelled" : "error",
          progress: state.progress,
          error: error instanceof Error ? error.message : String(error),
        };
        throw error;
      } finally {
        controller = null;
        ui.busy(false);
      }
    },
  };
  return api;
}

export type BrowserApi = ReturnType<typeof createBrowserApi>;
