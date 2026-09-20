import { spawn } from "node:child_process";
import { Worker } from "node:worker_threads";
import { mkdir, link, rename, rm, stat, readFile } from "node:fs/promises";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { parseProject } from "../core/schema";
import { totalDuration } from "../core/engine";
import { z } from "zod";
export const renderOptionsSchema = z.object({
  out: z.string().min(1),
  fps: z.number().int().min(1).max(60).optional(),
  format: z.enum(["mp4", "webm"]).default("mp4"),
  jobs: z.number().int().min(1).max(16).default(1),
  crop: z
    .tuple([
      z.number().int().min(0),
      z.number().int().min(0),
      z.number().int().positive(),
      z.number().int().positive(),
    ])
    .optional(),
  scale: z
    .tuple([
      z.number().int().min(16).max(4096),
      z.number().int().min(16).max(4096),
    ])
    .optional(),
  overwrite: z.boolean().default(false),
});
export type RenderOptions = z.input<typeof renderOptionsSchema>;
export async function readProject(filename: string) {
  if ((await stat(filename)).size > 5_000_000)
    throw new Error("Projet supérieur à 5 Mo.");
  return parseProject(JSON.parse(await readFile(filename, "utf8")));
}
export async function renderVideo(
  input: unknown,
  options: RenderOptions,
  progress: (frame: number, total: number) => void = () => {},
) {
  const project = parseProject(input),
    opts = renderOptionsSchema.parse(options);
  const fps = opts.fps ?? project.fps,
    frames = Math.ceil(totalDuration(project) * fps);
  const crop = opts.crop;
  if (
    crop &&
    (crop[0] + crop[2] > project.width || crop[1] + crop[3] > project.height)
  )
    throw new Error("Recadrage hors canevas.");
  const [width, height] =
    opts.scale ?? (crop ? [crop[2], crop[3]] : [project.width, project.height]);
  if (width % 2 || height % 2)
    throw new Error("Dimensions finales paires requises pour yuv420p.");
  const target = path.resolve(opts.out);
  await mkdir(path.dirname(target), { recursive: true });
  if (!opts.overwrite) {
    try {
      await stat(target);
      throw new Error("Sortie existante. Utiliser --overwrite.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const temporary = path.join(
    path.dirname(target),
    `.render-${crypto.randomUUID()}.${opts.format}`,
  );
  const filters = [
    crop ? `crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]}` : "",
    opts.scale ? `scale=${width}:${height}:flags=lanczos` : "",
  ].filter(Boolean);
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    `${project.width}x${project.height}`,
    "-framerate",
    String(fps),
    "-i",
    "pipe:0",
    "-an",
    ...(filters.length ? ["-vf", filters.join(",")] : []),
    "-c:v",
    opts.format === "mp4" ? "libx264" : "libvpx-vp9",
    "-pix_fmt",
    "yuv420p",
    "-threads",
    "1",
    ...(opts.format === "mp4"
      ? ["-movflags", "+faststart", "-crf", "18"]
      : ["-crf", "28", "-b:v", "0"]),
    "-frames:v",
    String(frames),
    "-y",
    temporary,
  ];
  const workers: Worker[] = [];
  const child = spawn(
    process.env.ANIMATELIER_FFMPEG || ffmpeg || "ffmpeg",
    args,
    { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
  );
  let errors = "";
  child.stderr.on("data", (chunk) => {
    errors = (errors + chunk).slice(-8000);
  });
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg (${code}): ${errors}`)),
    );
  });
  void done.catch(() => {});
  child.stdin.on("error", () => {});
  try {
    for (let i = 0; i < Math.min(opts.jobs, frames); i++)
      workers.push(
        new Worker(new URL("./worker.js", import.meta.url), {
          workerData: project,
        }),
      );
    const failures = new Map<Worker, Error>();
    for (const worker of workers)
      worker.on("error", (error) => failures.set(worker, error));
    const render = (worker: Worker, frame: number) =>
      new Promise<Uint8Array>((resolve, reject) => {
        if (failures.has(worker)) return reject(failures.get(worker));
        const cleanup = () => {
          worker.off("error", fail);
          worker.off("exit", exited);
          worker.off("message", message);
        };
        const fail = (error: Error) => {
          cleanup();
          reject(error);
        };
        const exited = (code: number) =>
          fail(new Error(`Worker arrêté (${code}).`));
        const message = (result: { pixels: Uint8Array; error?: string }) => {
          cleanup();
          result.error
            ? reject(new Error(result.error))
            : resolve(result.pixels);
        };
        worker.once("error", fail);
        worker.once("exit", exited);
        worker.once("message", message);
        worker.postMessage({ frame, fps });
      });
    for (let start = 0; start < frames; start += workers.length) {
      const batch = await Promise.all(
        workers
          .slice(0, frames - start)
          .map((worker, index) => render(worker, start + index)),
      );
      for (let i = 0; i < batch.length; i++) {
        await new Promise<void>((resolve, reject) =>
          child.stdin.write(batch[i], (error) =>
            error ? reject(error) : resolve(),
          ),
        );
        progress(start + i + 1, frames);
      }
    }
    child.stdin.end();
    await done;
    if (opts.overwrite) await rename(temporary, target);
    else {
      await link(temporary, target);
      await rm(temporary);
    }
    return { path: target, frames, fps, width, height, duration: frames / fps };
  } finally {
    child.kill();
    await Promise.all(workers.map((worker) => worker.terminate()));
    await done.catch(() => {});
    await rm(temporary, { force: true });
  }
}
