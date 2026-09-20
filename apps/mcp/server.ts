import { compileQuiz, quizSchema } from "../../packages/core/quiz";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { rasterFrame } from "../../packages/headless/frame";
import { renderVideo, readProject } from "../../packages/headless/video";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  stat,
  lstat,
} from "node:fs/promises";
import path from "node:path";
import {
  demoProject,
  parseProject,
  projectSchema,
  actions,
  backgrounds,
  type Project,
} from "../../packages/core/schema";
import { commandSchema, ProjectStore } from "../../packages/core/commands";
import { totalDuration } from "../../packages/core/engine";
import {
  agentSchema,
  getStateAt,
  validateProject,
} from "../../packages/core/agent";
import { renderProjectSvg } from "../../packages/renderer/svg";

const server = new McpServer({ name: "animatelier", version: "0.2.0" });
const store = new ProjectStore(demoProject());
let revision = 0;
const root = path.resolve(
  process.env.ANIMATELIER_PROJECTS_DIR ||
    path.join(process.cwd(), "agent-projects"),
);
const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const safe = (fn: () => Promise<any> | any) =>
  Promise.resolve()
    .then(fn)
    .catch((e) => ({
      isError: true,
      content: [
        {
          type: "text" as const,
          text: e instanceof Error ? e.message : String(e),
        },
      ],
    }));
const snapshot = () => ({
  revision,
  duration: totalDuration(store.get()),
  project: store.get(),
});
const checkRevision = (expected: number) => {
  if (expected !== revision)
    throw new Error(
      `Conflit : révision attendue ${expected}, révision actuelle ${revision}. Relisez le projet.`,
    );
};
const nameSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.json$/);
const preview = async (project: Project, time: number) =>
  rasterFrame(project, time).asPng();

server.registerTool(
  "project_get",
  {
    description:
      "Lire le projet, sa révision et sa durée. Toujours lire avant de modifier.",
    inputSchema: {},
  },
  async () => text(snapshot()),
);
server.registerTool(
  "capabilities",
  {
    description: "Lire les actions, décors, limites et conventions du studio.",
    inputSchema: {},
  },
  async () =>
    text({
      schema: agentSchema(),
      schemaVersion: 2,
      actions,
      backgrounds,
      resolution: [store.get().width, store.get().height],
      fps: store.get().fps,
      coordinateSystem:
        "x vers la droite, y vers le bas, position du personnage aux pieds ; temps des acteurs relatif à la scène ; temps de rendu global au projet",
      commandTypes: [
        "project.rename",
        "scene.add",
        "scene.replace",
        "scene.remove",
        "actor.add",
        "actor.replace",
        "actor.remove",
        "element.add",
        "element.replace",
        "element.remove",
      ],
      workflow: [
        "project_get",
        "project_apply",
        "render_frame ou render_storyboard",
        "project_apply",
        "project_save",
      ],
      limits: {
        scenes: 30,
        actorsPerScene: 40,
        sceneSeconds: 120,
        commandsPerBatch: 100,
      },
      notes: [
        "Rigs et décors originaux intégrés.",
        "Pas de voix ni de synchronisation labiale audio.",
        "project_render_video démarre un rendu CPU ; render_status suit le job. Un rendu actif, aucun écrasement.",
        "Les fichiers sauvegardés peuvent être importés dans l’éditeur.",
        "Pas de synchronisation automatique avec un navigateur.",
      ],
    }),
);
server.registerTool(
  "quiz_compile",
  {
    description:
      "Compiler un QCM ou une liste à révélations différées en projet v2 et calendrier, sans modifier la session. Lire capabilities pour les exemples et le guide.",
    inputSchema: { spec: quizSchema },
  },
  async ({ spec }) => safe(() => text(compileQuiz(spec))),
);
server.registerTool(
  "project_validate",
  {
    description:
      "Valider un projet sans modifier la session ; retourne les erreurs détaillées.",
    inputSchema: { project: z.unknown() },
  },
  async ({ project }) => text(validateProject(project)),
);
server.registerTool(
  "project_state_at",
  {
    description:
      "Inspecter la scène et les positions, actions et bulles à un temps global sans image.",
    inputSchema: { time: z.number().finite() },
  },
  async ({ time }) =>
    safe(() => text({ revision, ...getStateAt(store.get(), time) })),
);
server.registerTool(
  "project_apply",
  {
    description:
      "Appliquer un lot atomique de commandes. En cas d’erreur, aucune modification. Les remplacements utilisent un objet complet.",
    inputSchema: {
      expectedRevision: z.number().int().min(0),
      commands: z.array(commandSchema).min(1).max(100),
    },
  },
  async ({ expectedRevision, commands }) =>
    safe(() => {
      checkRevision(expectedRevision);
      store.dispatch(commands);
      revision++;
      return text(snapshot());
    }),
);
server.registerTool(
  "project_load_data",
  {
    description:
      "Remplacer le projet courant avec un document v2 complet ; annulation possible.",
    inputSchema: {
      expectedRevision: z.number().int().min(0),
      project: projectSchema,
    },
  },
  async ({ expectedRevision, project }) =>
    safe(() => {
      checkRevision(expectedRevision);
      store.replace(project);
      revision++;
      return text(snapshot());
    }),
);
server.registerTool(
  "project_undo",
  {
    description: "Annuler le dernier lot ou chargement.",
    inputSchema: { expectedRevision: z.number().int().min(0) },
  },
  async ({ expectedRevision }) =>
    safe(() => {
      checkRevision(expectedRevision);
      if (!store.canUndo) throw new Error("Rien à annuler.");
      store.undo();
      revision++;
      return text(snapshot());
    }),
);
server.registerTool(
  "render_frame",
  {
    description:
      "Voir l’animation à un temps global en secondes. Retourne une véritable image PNG pour inspection visuelle.",
    inputSchema: { time: z.number().min(0).max(3600) },
  },
  async ({ time }) =>
    safe(async () => {
      const frame = snapshot();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              revision: frame.revision,
              time: Math.min(time, frame.duration),
            }),
          },
          {
            type: "image",
            mimeType: "image/png",
            data: (await preview(frame.project, time)).toString("base64"),
          },
        ],
      };
    }),
);
server.registerTool(
  "render_storyboard",
  {
    description:
      "Voir de 2 à 8 images à des temps globaux précis afin de comparer poses et déplacements. Ne remplace pas l’évaluation vidéo de la fluidité.",
    inputSchema: { times: z.array(z.number().min(0).max(3600)).min(2).max(8) },
  },
  async ({ times }) =>
    safe(async () => {
      const content: any[] = [];
      const frame = snapshot();
      for (const time of times) {
        content.push({
          type: "text",
          text: `Révision ${frame.revision} — ${Math.min(time, frame.duration)} secondes`,
        });
        content.push({
          type: "image",
          mimeType: "image/png",
          data: (await preview(frame.project, time)).toString("base64"),
        });
      }
      return { content };
    }),
);
server.registerTool(
  "project_save",
  {
    description:
      "Sauvegarder un JSON dans le dossier de projets autorisé. Écrasement uniquement avec overwrite=true. Le chemin retourné est importable dans l’éditeur.",
    inputSchema: {
      filename: nameSchema,
      overwrite: z.boolean().default(false),
    },
  },
  async ({ filename, overwrite }) =>
    safe(async () => {
      const saved = snapshot();
      await mkdir(root, { recursive: true });
      const target = path.join(root, filename);
      const data = JSON.stringify(saved.project, null, 2);
      if (!overwrite) await writeFile(target, data, { flag: "wx" });
      else {
        const temporary = path.join(root, `.save-${crypto.randomUUID()}.tmp`);
        await writeFile(temporary, data, { flag: "wx" });
        await rename(temporary, target);
      }
      return text({ revision: saved.revision, path: target });
    }),
);
server.registerTool(
  "project_open",
  {
    description:
      "Charger un JSON présent dans le dossier de projets autorisé. Le fichier doit être inférieur à 5 Mo.",
    inputSchema: {
      filename: nameSchema,
      expectedRevision: z.number().int().min(0),
    },
  },
  async ({ filename, expectedRevision }) =>
    safe(async () => {
      checkRevision(expectedRevision);
      const target = path.join(root, filename);
      if ((await lstat(target)).isSymbolicLink())
        throw new Error("Liens symboliques non autorisés.");
      if ((await stat(target)).size > 5_000_000)
        throw new Error("Fichier trop volumineux.");
      const project = parseProject(JSON.parse(await readFile(target, "utf8")));
      checkRevision(expectedRevision);
      store.replace(project);
      revision++;
      return text(snapshot());
    }),
);

const renderJobs = new Map<
  string,
  {
    status: string;
    frame: number;
    total: number;
    result?: unknown;
    error?: string;
  }
>();
let renderActive = false;
server.registerTool(
  "project_render_video",
  {
    description:
      "Démarrer un rendu CPU asynchrone dans le dossier autorisé. Source : filename, project, ou session courante. Consulter render_status. Aucun écrasement.",
    inputSchema: {
      filename: nameSchema.optional(),
      project: projectSchema.optional(),
      out: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.(mp4|webm)$/),
      fps: z.number().int().min(1).max(60).optional(),
      format: z.enum(["mp4", "webm"]).default("mp4"),
      jobs: z.number().int().min(1).max(4).default(1),
    },
  },
  async ({ filename, project, out, fps, format, jobs }) =>
    safe(async () => {
      if (renderActive) throw new Error("Un rendu est déjà actif.");
      if (filename && project) throw new Error("Choisir filename ou project.");
      if (!out.endsWith("." + format))
        throw new Error("Extension incompatible avec format.");
      renderActive = true;
      try {
        let source = project ?? store.get();
        if (filename) {
          const input = path.join(root, filename);
          if ((await lstat(input)).isSymbolicLink())
            throw new Error("Liens symboliques non autorisés.");
          source = await readProject(input);
        }
        const id = crypto.randomUUID();
        if (renderJobs.size >= 20)
          renderJobs.delete(renderJobs.keys().next().value!);
        const job = {
          status: "running",
          frame: 0,
          total: Math.ceil(totalDuration(source) * (fps ?? source.fps)),
        } as {
          status: string;
          frame: number;
          total: number;
          result?: unknown;
          error?: string;
        };
        renderJobs.set(id, job);
        void renderVideo(
          source,
          { out: path.join(root, out), fps, format, jobs },
          (frame, total) => Object.assign(job, { frame, total }),
        )
          .then((result) => Object.assign(job, { status: "completed", result }))
          .catch((error) =>
            Object.assign(job, { status: "failed", error: String(error) }),
          )
          .finally(() => {
            renderActive = false;
          });
        return text({ jobId: id, ...job });
      } catch (error) {
        renderActive = false;
        throw error;
      }
    }),
);
server.registerTool(
  "render_status",
  {
    description:
      "Lire la progression ou le résultat d’un rendu vidéo de cette session.",
    inputSchema: { jobId: z.string().uuid() },
  },
  async ({ jobId }) =>
    safe(() => {
      const job = renderJobs.get(jobId);
      if (!job) throw new Error("Job introuvable.");
      return text({ jobId, ...job });
    }),
);
await server.connect(new StdioServerTransport());
