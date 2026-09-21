import path from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  link,
  lstat,
  stat,
  copyFile,
} from "node:fs/promises";
import sharp from "sharp";
import { compileQuiz } from "../core/quiz";
import { resolveTheme } from "../core/themes";
import { resolveProjectAssets, decodeImage, localAssetFile } from "./assets";
import { flattenElements } from "../core/elements";
import { rasterFrame } from "./frame";
import { renderVideo } from "./video";
import { muxAudio, synthesizeSfx, soundMappingSchema } from "./audio";
import type { Project } from "../core/schema";
export interface PipelineOptions {
  out?: string;
  theme?: string;
  assetsDir?: string;
  jobs?: number;
  target?: "instagram-reel";
  audio?: string;
  sfx?: string;
  cover?: string;
  coverAt?: number;
  preview?: string;
  check?: boolean;
}
async function jsonFile(filename: string) {
  if ((await stat(filename)).size > 5_000_000)
    throw new Error("JSON supérieur à 5 Mo.");
  return JSON.parse(await readFile(filename, "utf8"));
}
export function previewTimes(
  value: string | undefined,
  duration: number,
  events: { time: number; type: string }[],
) {
  const times =
    !value || value === "auto"
      ? [
          Math.min(1, duration / 2),
          ...events
            .filter((e) => ["level", "question", "reveal"].includes(e.type))
            .map((e) => e.time),
        ]
      : value.split(",").map(Number);
  if (
    !times.length ||
    times.some((t) => !Number.isFinite(t) || t < 0 || t >= duration)
  )
    throw new Error("Instants d’aperçu hors durée.");
  const unique = [...new Set(times)];
  if (unique.length > 24 && value && value !== "auto")
    throw new Error("Maximum 24 aperçus.");
  return unique.length <= 24
    ? unique
    : Array.from(
        { length: 24 },
        (_, i) => unique[Math.round((i * (unique.length - 1)) / 23)],
      );
}
async function jpeg(project: Project, time: number) {
  return sharp(rasterFrame(project, time).asPng())
    .flatten({ background: "#000000" })
    .jpeg({ quality: 90 })
    .toBuffer();
}
export async function makePreview(project: Project, times: number[]) {
  const width = 270,
    height = Math.round((width * project.height) / project.width),
    columns = Math.min(4, times.length);
  const tiles = [];
  for (let i = 0; i < times.length; i++) {
    const input = await sharp(rasterFrame(project, times[i]).asPng())
      .resize(width, height)
      .flatten({ background: "#000000" })
      .png()
      .toBuffer();
    tiles.push({
      input,
      left: (i % columns) * width,
      top: Math.floor(i / columns) * height,
    });
  }
  return sharp({
    create: {
      width: width * columns,
      height: height * Math.ceil(times.length / columns),
      channels: 3,
      background: "#202020",
    },
  })
    .composite(tiles)
    .jpeg({ quality: 85 })
    .toBuffer();
}
export async function quizVideo(
  input: unknown,
  options: PipelineOptions,
  progress?: (frame: number, total: number) => void,
) {
  let theme;
  if (options.theme) {
    theme = /[\\/]|\.json$/i.test(options.theme)
      ? resolveTheme(await jsonFile(options.theme))
      : resolveTheme(options.theme);
  }
  const compiled = compileQuiz(input, theme);
  // Brand logos belong to their kit, independently of the quiz image directory.
  const specTheme =
    input && typeof input === "object" && "theme" in input
      ? input.theme
      : undefined;
  const effectiveTheme = resolveTheme(
    typeof specTheme === "object"
      ? specTheme
      : (theme ?? specTheme ?? "default"),
    theme,
  );
  const logoSrc = effectiveTheme.logo?.src;
  if (logoSrc?.startsWith("file:")) {
    const builtinLogo = logoSrc === "file:brands/qff/logo.png";
    const themeFile =
      options.theme && /[\\/]|\.json$/i.test(options.theme)
        ? path.resolve(options.theme)
        : undefined;
    const logoRoot = builtinLogo
      ? fileURLToPath(new URL("../../", import.meta.url))
      : themeFile
        ? path.dirname(themeFile)
        : options.assetsDir;
    if (!logoRoot)
      throw new Error(
        "Un logo file: nécessite --assets-dir ou un fichier thème.",
      );
    const asset = await decodeImage(
      await readFile(await localAssetFile(logoRoot, logoSrc.slice(5))),
    );
    const id = `image_${asset.sha256}`;
    compiled.project.assets = { ...compiled.project.assets, [id]: asset };
    for (const scene of compiled.project.scenes)
      for (const element of flattenElements(scene.elements)) {
        if (element.type === "image" && element.src === logoSrc)
          element.src = `asset:${id}`;
      }
  }
  const project = await resolveProjectAssets(
    compiled.project,
    options.assetsDir,
  );
  const times = previewTimes(
    options.preview,
    compiled.duration,
    compiled.timeline.events,
  );
  const coverAt = options.coverAt ?? Math.min(1, compiled.duration / 2);
  if (!Number.isFinite(coverAt) || coverAt < 0 || coverAt >= compiled.duration)
    throw new Error("Instant de couverture hors durée.");
  const soundMapping =
    options.sfx && options.sfx !== "default"
      ? soundMappingSchema.parse(await jsonFile(options.sfx))
      : {};
  if (options.audio) await stat(options.audio);
  if (options.check)
    return {
      check: true,
      duration: compiled.duration,
      frames: Math.ceil(compiled.duration * 30),
      warnings: compiled.warnings,
      previewTimes: times,
    };
  if (!options.out) throw new Error("--out requis pour le rendu.");
  const directory = path.resolve(options.out);
  await mkdir(directory, { recursive: true });
  const coverTarget = options.cover
    ? path.resolve(options.cover)
    : path.join(directory, "cover.jpg");
  const outputs = [
    "video.mp4",
    "project.json",
    "timeline.json",
    "voice-script.json",
    "preview.jpg",
  ].map((name) => path.join(directory, name));
  outputs.push(coverTarget);
  if (new Set(outputs).size !== outputs.length)
    throw new Error("Chemins de sortie en conflit.");
  for (const target of outputs) {
    try {
      await lstat(target);
      throw new Error(`Sortie existante : ${target}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // Stage every artifact before publishing; exclusive links never overwrite a racing writer.
  const staging = await mkdtemp(path.join(directory, ".quiz-"));
  const published: string[] = [];
  try {
    const silent = path.join(staging, "silent.mp4");
    const result = await renderVideo(
      project,
      {
        out: silent,
        jobs: options.jobs,
        target: options.target ?? "instagram-reel",
      },
      progress,
    );
    const tracks = options.audio ? [path.resolve(options.audio)] : [];
    if (options.sfx) {
      const wav = path.join(staging, "sfx.wav");
      await synthesizeSfx(
        wav,
        result.duration,
        compiled.timeline.events,
        soundMapping,
      );
      tracks.push(wav);
    }
    const video = tracks.length ? path.join(staging, "video.mp4") : silent;
    if (tracks.length) await muxAudio(silent, tracks, video, result.duration);
    await writeFile(
      path.join(staging, "project.json"),
      JSON.stringify(project, null, 2),
    );
    await writeFile(
      path.join(staging, "timeline.json"),
      JSON.stringify(compiled.timeline, null, 2),
    );
    await writeFile(
      path.join(staging, "voice-script.json"),
      JSON.stringify(compiled.voiceScript, null, 2),
    );
    await writeFile(
      path.join(staging, "cover.jpg"),
      await jpeg(project, coverAt),
    );
    await writeFile(
      path.join(staging, "preview.jpg"),
      await makePreview(project, times),
    );
    const sources = [
      video,
      ...[
        "project.json",
        "timeline.json",
        "voice-script.json",
        "preview.jpg",
        "cover.jpg",
      ].map((name) => path.join(staging, name)),
    ];
    for (let i = 0; i < outputs.length; i++) {
      await mkdir(path.dirname(outputs[i]), { recursive: true });
      try {
        await link(sources[i], outputs[i]);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
        await copyFile(sources[i], outputs[i], constants.COPYFILE_EXCL);
      }
      published.push(outputs[i]);
    }
    return {
      ...result,
      path: outputs[0],
      outputs,
      warnings: compiled.warnings,
      previewTimes: times,
    };
  } catch (error) {
    await Promise.all(published.map((file) => rm(file, { force: true })));
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
