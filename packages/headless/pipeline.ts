import { normalizeLevels, levelsSchema } from "../core/levels";
import { stackSchema } from "../core/stack";
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
  open,
} from "node:fs/promises";
import sharp from "sharp";
import { compileQuiz } from "../core/quiz";
import { resolveTheme } from "../core/themes";
import { resolveProjectAssets, decodeImage, localAssetFile } from "./assets";
import { flattenElements } from "../core/elements";
import { rasterFrame } from "./frame";
import { renderVideo } from "./video";
import {
  muxAudio,
  synthesizeSfx,
  synthesizeMusic,
  soundMappingSchema,
  audioDuration,
  mixVoiceClips,
  muxSoundtrack,
  mediaInfo,
  measureLoudness,
  mixQuestionSounds,
  type QuestionSoundClip,
  runFfmpeg,
  type VoiceClip,
} from "./audio";
import { inspectQuestionSounds } from "./sounds";
import type { Project } from "../core/schema";
export interface PipelineOptions {
  out?: string;
  theme?: string;
  preset?: string;
  assetsDir?: string;
  jobs?: number;
  target?: "instagram-reel";
  audio?: string;
  sfx?: string;
  cover?: string;
  coverAt?: number;
  coverImage?: string;
  voiceDurations?: string;
  voiceClips?: string;
  music?: string;
  loudness?: number;
  verbose?: boolean;
  previewOnly?: boolean;
  previewScale?: number;
  frames?: string;
  crop?: [number, number, number, number];
  draft?: boolean;
  preview?: string;
  check?: boolean;
  soundsOut?: string;
  safeZones?: boolean;
  audioPreview?: boolean;
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
            .filter((e) =>
              [
                "level",
                "question",
                "listen",
                "reveal",
                "recap",
                "outro",
                "custom",
              ].includes(e.type),
            )
            .map((e) =>
              e.type === "reveal"
                ? Math.min(duration - 1 / 30, e.time + 0.4)
                : e.time,
            ),
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
/** Fits a supplied image (typically the brand logo) on a canvas of the project size. */
export async function coverFromImage(
  base64: string,
  width: number,
  height: number,
  background: string,
) {
  return sharp(Buffer.from(base64, "base64"))
    .resize(width, height, { fit: "contain", background })
    .flatten({ background })
    .jpeg({ quality: 90 })
    .toBuffer();
}
export async function makePreview(
  project: Project,
  times: number[],
  scale = 1,
  safeZones = false,
) {
  if (!Number.isFinite(scale) || scale < 0.1 || scale > 2)
    throw new Error("--preview-scale doit être entre 0.1 et 2.");
  const width = Math.round(270 * scale),
    height = Math.round((width * project.height) / project.width),
    columns = Math.min(4, times.length);
  const tiles = [];
  for (let i = 0; i < times.length; i++) {
    const base = sharp(rasterFrame(project, times[i]).asPng()).resize(
      width,
      height,
    );
    const withZones =
      safeZones && project.height > project.width
        ? base.composite([
            {
              input: Buffer.from(
                `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="${Math.round((120 * height) / project.height)}" fill="#ff0000" fill-opacity="0.25"/><rect x="0" y="${height - Math.round((220 * height) / project.height)}" width="${width}" height="${Math.round((220 * height) / project.height)}" fill="#ff0000" fill-opacity="0.25"/></svg>`,
              ),
            },
          ])
        : base;
    const input = await withZones
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
function frameTimes(value: string | undefined, duration: number) {
  if (!value) return [];
  const times = value.split(",").map(Number);
  if (
    !times.length ||
    times.length > 24 ||
    times.some((t) => !Number.isFinite(t) || t < 0 || t >= duration)
  )
    throw new Error(
      "--frames attend 1 à 24 instants avant la fin de la vidéo.",
    );
  return times;
}
async function framePng(
  project: Project,
  time: number,
  crop?: [number, number, number, number],
) {
  let image = sharp(rasterFrame(project, time).asPng());
  if (crop) {
    const [left, top, width, height] = crop;
    if (
      ![left, top, width, height].every(Number.isInteger) ||
      left < 0 ||
      top < 0 ||
      width < 1 ||
      height < 1 ||
      left + width > project.width ||
      top + height > project.height
    )
      throw new Error("--crop hors canevas.");
    image = image.extract({ left, top, width, height });
  }
  return image.png().toBuffer();
}
async function hasEditList(filename: string) {
  const file = await open(filename, "r");
  try {
    const buffer = Buffer.alloc(2_000_000);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).includes(Buffer.from("elst"));
  } finally {
    await file.close();
  }
}
export async function quizVideo(
  input: unknown,
  options: PipelineOptions,
  progress?: (frame: number, total: number) => void,
) {
  if (options.preset) {
    const preset = await jsonFile(options.preset);
    if (
      !preset ||
      typeof preset !== "object" ||
      Array.isArray(preset) ||
      !input ||
      typeof input !== "object" ||
      Array.isArray(input)
    )
      throw new Error("Preset ou spec invalide.");
    const source = input as Record<string, unknown>,
      base = preset as Record<string, unknown>;
    input = {
      ...base,
      ...source,
      intro: {
        ...((base.intro as object) ?? {}),
        ...((source.intro as object) ?? {}),
      },
      outro: {
        ...((base.outro as object) ?? {}),
        ...((source.outro as object) ?? {}),
      },
      timing: {
        ...((base.timing as object) ?? {}),
        ...((source.timing as object) ?? {}),
      },
      defaults: {
        ...((base.defaults as object) ?? {}),
        ...((source.defaults as object) ?? {}),
      },
    };
  }
  if (input && typeof input === "object" && "levels" in input)
    input = normalizeLevels(input);
  let theme;
  if (options.theme) {
    theme = /[\\/]|\.json$/i.test(options.theme)
      ? resolveTheme(await jsonFile(options.theme))
      : resolveTheme(options.theme);
  }
  if (options.voiceDurations && options.voiceClips)
    throw new Error(
      "Choisir --voice-clips ou --voice-durations, pas les deux.",
    );
  let voiceDurations = options.voiceDurations
    ? await jsonFile(options.voiceDurations)
    : undefined;
  const clipFiles = new Map<string, string>();
  const voiceSpec =
    input && typeof input === "object" && "levels" in input
      ? levelsSchema.parse(input)
      : undefined;
  const stackSpec =
    input &&
    typeof input === "object" &&
    "mode" in input &&
    input.mode === "stack"
      ? stackSchema.parse(input)
      : undefined;
  if (options.voiceClips) {
    if (!voiceSpec && !stackSpec)
      throw new Error("--voice-clips requiert le mode levels ou stack.");
    const slots = compileQuiz(input, theme, { voiceDurations: {} }).voiceScript;
    const measured: Record<string, number> = {};
    for (const slot of slots) {
      const filename = path.join(
        path.resolve(options.voiceClips),
        `${slot.id}.wav`,
      );
      try {
        await stat(filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      measured[slot.id] = await audioDuration(filename);
      clipFiles.set(slot.id, filename);
    }
    if (!clipFiles.size)
      throw new Error(
        `Aucun clip WAV correspondant aux IDs du script vocal dans ${options.voiceClips}.`,
      );
    voiceDurations = measured;
  }
  const inspectedSounds =
    voiceSpec || stackSpec
      ? await inspectQuestionSounds(
          voiceSpec ?? {
            levels: [{ questions: stackSpec!.items }],
            timing: { listen: stackSpec!.timing.listen },
            audioAssets: stackSpec!.audioAssets,
          },
          options.assetsDir,
        )
      : new Map<
          string,
          { file: string; duration: number; amplitudes: number[] }
        >();
  const compiled = compileQuiz(input, theme, {
    voiceDurations,
    protectVoiceClips: !!options.voiceClips,
    soundMetadata: Object.fromEntries(
      [...inspectedSounds].map(([id, sound]) => [
        id,
        { duration: sound.duration, amplitudes: sound.amplitudes },
      ]),
    ),
  });
  const voiceClips: VoiceClip[] = [];
  const overlaps: string[] = [];
  if (options.voiceClips && (voiceSpec || stackSpec)) {
    for (const slot of compiled.voiceScript) {
      const file = clipFiles.get(slot.id);
      if (!file) {
        compiled.warnings.push(`Voice clip missing: ${slot.id}.wav`);
        continue;
      }
      const kind = voiceSpec?.sequence?.some((item) => item.id === slot.id)
        ? "custom"
        : slot.id === "intro" || slot.id === "outro"
          ? slot.id
          : slot.id.startsWith("level_")
            ? "level"
            : slot.id.endsWith("_answer")
              ? "answer"
              : "question";
      const start =
        slot.start +
        (voiceSpec && kind !== "custom" ? voiceSpec.voice.offsets[kind] : 0);
      const duration = (voiceDurations as Record<string, number>)[slot.id];
      if (start + duration > slot.start + slot.maxDuration + 1 / 30)
        compiled.warnings.push(`Voice clip exceeds slot: ${slot.id}`);
      voiceClips.push({ id: slot.id, file, start, duration });
    }
    voiceClips.sort((a, b) => a.start - b.start);
    for (let i = 0; i < voiceClips.length; i++)
      for (let j = i + 1; j < voiceClips.length; j++) {
        if (
          voiceClips[j].start >=
          voiceClips[i].start + voiceClips[i].duration - 1 / 1000
        )
          break;
        overlaps.push(`${voiceClips[i].id} / ${voiceClips[j].id}`);
      }
    compiled.warnings.push(
      ...overlaps.map((value) => `Voice overlap: ${value}`),
    );
  }
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
  const stillTimes = frameTimes(options.frames, compiled.duration);
  const coverAt = options.coverAt ?? Math.min(1, compiled.duration / 2);
  if (!Number.isFinite(coverAt) || coverAt < 0 || coverAt >= compiled.duration)
    throw new Error("Instant de couverture hors durée.");
  const soundMapping =
    options.sfx && options.sfx !== "default"
      ? soundMappingSchema.parse(await jsonFile(options.sfx))
      : {};
  if (options.audio) await stat(options.audio);
  if (options.audio && (options.voiceClips || options.music))
    throw new Error(
      "--audio ne peut pas être combiné avec --voice-clips ou --music.",
    );
  if (options.audio && inspectedSounds.size)
    throw new Error(
      "--audio ne peut pas être combiné avec des questions sonores ; utilisez --music.",
    );
  if (options.audioPreview && options.previewOnly)
    throw new Error("Choisir --audio-preview ou --preview-only, pas les deux.");
  if (options.music && options.music !== "default") await stat(options.music);
  if (
    options.loudness !== undefined &&
    (!Number.isFinite(options.loudness) ||
      options.loudness < -30 ||
      options.loudness > -8)
  )
    throw new Error("--loudness doit être entre -30 et -8 LUFS.");
  const coverImage = options.coverImage
    ? await decodeImage(await readFile(options.coverImage))
    : undefined;
  if (options.check)
    return {
      check: true,
      duration: compiled.duration,
      frames: Math.ceil(compiled.duration * (options.draft ? 15 : 30)),
      warnings: compiled.warnings,
      layoutReport: "layoutReport" in compiled ? compiled.layoutReport : [],
      sounds: await Promise.all(
        [...inspectedSounds].map(async ([id, sound]) => {
          const question = compiled.timeline.questions.find(
            (item) => item.id === id,
          );
          const audible = question as
            | { audioStart?: number; listenStart?: number; listenEnd?: number }
            | undefined;
          const start = audible?.audioStart ?? 0;
          const playDuration =
            audible?.listenStart !== undefined &&
            audible.listenEnd !== undefined
              ? audible.listenEnd - audible.listenStart
              : Math.min(4, sound.duration - start);
          return {
            id,
            duration: sound.duration,
            file: sound.file,
            ...(await measureLoudness(sound.file, start, playDuration)),
          };
        }),
      ),
      ...(options.verbose
        ? { previewTimes: times, voiceOverlaps: overlaps }
        : {}),
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
  const stillNames = stillTimes.map(
    (_, i) => `frame-${String(i + 1).padStart(2, "0")}.png`,
  );
  if (options.previewOnly)
    outputs.splice(
      0,
      outputs.length,
      path.join(directory, "project.json"),
      path.join(directory, "preview.jpg"),
    );
  if (options.audioPreview)
    outputs.splice(
      0,
      outputs.length,
      path.join(directory, "audio-preview.mp3"),
      path.join(directory, "timeline.json"),
      path.join(directory, "voice-script.json"),
    );
  if (!options.audioPreview)
    outputs.push(...stillNames.map((name) => path.join(directory, name)));
  if (options.soundsOut && inspectedSounds.size && !options.previewOnly)
    outputs.push(path.resolve(options.soundsOut));
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
    if (options.previewOnly) {
      await writeFile(
        path.join(staging, "project.json"),
        JSON.stringify(project, null, 2),
      );
      await writeFile(
        path.join(staging, "preview.jpg"),
        await makePreview(
          project,
          times,
          options.previewScale,
          options.safeZones,
        ),
      );
      for (let i = 0; i < stillTimes.length; i++)
        await writeFile(
          path.join(staging, stillNames[i]),
          await framePng(project, stillTimes[i], options.crop),
        );
      for (const target of outputs) {
        await link(path.join(staging, path.basename(target)), target);
        published.push(target);
      }
      return {
        previewOnly: true,
        duration: compiled.duration,
        outputs,
        warnings: compiled.warnings,
      };
    }
    const tracks = options.audio ? [path.resolve(options.audio)] : [];
    let voiceTrack: string | undefined;
    if (voiceClips.length) {
      voiceTrack = path.join(staging, "voice.wav");
      await mixVoiceClips(voiceClips, voiceTrack, compiled.duration);
    }
    let questionTrack: string | undefined;
    if (inspectedSounds.size && "questions" in compiled.timeline) {
      const clips: QuestionSoundClip[] = [];
      for (const question of compiled.timeline.questions) {
        const sound = inspectedSounds.get(question.id);
        if (
          !sound ||
          !("listenStart" in question) ||
          question.listenStart === undefined ||
          question.listenEnd === undefined
        )
          continue;
        const specification = (voiceSpec?.levels.flatMap(
          (level) => level.questions,
        ) ?? stackSpec?.items)?.[Number(question.id.slice(9)) - 1];
        const listenDuration = question.listenEnd - question.listenStart;
        const countdownDuration =
          specification?.audioDuringCountdown === "stop"
            ? 0
            : question.reveal - question.listenEnd;
        clips.push({
          file: sound.file,
          start: question.listenStart,
          sourceStart: question.audioStart ?? 0,
          duration:
            listenDuration +
            (specification?.audioDuringCountdown === "continue"
              ? Math.min(
                  countdownDuration,
                  Math.max(
                    0,
                    sound.duration -
                      (question.audioStart ?? 0) -
                      listenDuration,
                  ),
                )
              : countdownDuration),
          gainDb: question.audioGain ?? 0,
          loop: specification?.audioDuringCountdown === "loop",
        });
        if (question.replayOnReveal) {
          const answerClip = voiceClips.find(
            (clip) => clip.id === `${question.id}_answer`,
          );
          const recap =
            voiceSpec?.revealMode === "end" && "recaps" in compiled.timeline
              ? compiled.timeline.recaps.find(
                  (entry) => entry.questionId === question.id,
                )
              : undefined;
          const windowStart = recap?.start ?? question.reveal,
            windowEnd = recap?.end ?? question.end;
          const replayStart = Math.max(
            windowStart + 0.05,
            answerClip
              ? answerClip.start + answerClip.duration + 0.05
              : windowStart + 0.35,
          );
          const replayDuration = Math.min(
            windowEnd - replayStart,
            sound.duration - (question.audioStart ?? 0),
          );
          if (replayDuration > 0.2)
            clips.push({
              file: sound.file,
              start: replayStart,
              sourceStart: question.audioStart ?? 0,
              duration: replayDuration,
              gainDb: question.audioGain ?? 0,
            });
          else
            compiled.warnings.push(
              `${question.id}: no time for replay after answer voice.`,
            );
        }
      }
      if (clips.length) {
        questionTrack = path.join(staging, "sounds.wav");
        await mixQuestionSounds(clips, questionTrack, compiled.duration);
      }
    }
    let sfxTrack: string | undefined;
    if (options.sfx) {
      const wav = path.join(staging, "sfx.wav");
      await synthesizeSfx(
        wav,
        compiled.duration,
        compiled.timeline.events,
        soundMapping,
      );
      tracks.push(wav);
      sfxTrack = wav;
    }
    let musicTrack =
      options.music && options.music !== "default"
        ? path.resolve(options.music)
        : undefined;
    if (options.music === "default") {
      musicTrack = path.join(staging, "music.wav");
      await synthesizeMusic(
        musicTrack,
        compiled.duration,
        voiceSpec?.music ?? { bpm: 108, root: 48, progression: [0, 5, 9, 7] },
      );
    }
    if (options.audioPreview) {
      const inputs = [
        voiceTrack,
        musicTrack,
        sfxTrack,
        questionTrack,
        options.audio,
      ].filter((file): file is string => !!file);
      if (!inputs.length)
        throw new Error(
          "--audio-preview nécessite un son, une voix, une musique ou des effets.",
        );
      const labels = inputs.map((_, i) => `[${i}:a]`).join("");
      const filters = `${labels}amix=inputs=${inputs.length}:duration=longest:normalize=0,apad,atrim=duration=${compiled.duration},loudnorm=I=${options.loudness ?? -16}:TP=-1.5:LRA=11,alimiter=limit=0.95[a]`;
      await runFfmpeg([
        ...inputs.flatMap((file) => [
          ...(file === musicTrack ? ["-stream_loop", "-1"] : []),
          "-i",
          file,
        ]),
        "-filter_complex",
        filters,
        "-map",
        "[a]",
        "-t",
        String(compiled.duration),
        "-c:a",
        "libmp3lame",
        "-b:a",
        "160k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-n",
        path.join(staging, "audio-preview.mp3"),
      ]);
      await writeFile(
        path.join(staging, "timeline.json"),
        JSON.stringify(compiled.timeline, null, 2),
      );
      await writeFile(
        path.join(staging, "voice-script.json"),
        JSON.stringify(compiled.voiceScript, null, 2),
      );
      const previewSources = [
        path.join(staging, "audio-preview.mp3"),
        path.join(staging, "timeline.json"),
        path.join(staging, "voice-script.json"),
        ...(options.soundsOut && questionTrack ? [questionTrack] : []),
      ];
      for (let i = 0; i < outputs.length; i++) {
        await mkdir(path.dirname(outputs[i]), { recursive: true });
        try {
          await link(previewSources[i], outputs[i]);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
          await copyFile(
            previewSources[i],
            outputs[i],
            constants.COPYFILE_EXCL,
          );
        }
        published.push(outputs[i]);
      }
      return {
        audioPreview: true,
        duration: compiled.duration,
        outputs,
        warnings: compiled.warnings,
        report: await measureLoudness(path.join(staging, "audio-preview.mp3")),
      };
    }
    const result = await renderVideo(
      project,
      {
        out: silent,
        jobs: options.jobs,
        target: options.draft
          ? undefined
          : (options.target ?? "instagram-reel"),
        fps: options.draft ? 15 : undefined,
        scale: options.draft
          ? [
              Math.round(project.width / 4) * 2,
              Math.round(project.height / 4) * 2,
            ]
          : undefined,
      },
      progress,
    );
    const hasNewMix = !!voiceTrack || !!options.music || !!questionTrack;
    const video =
      tracks.length || hasNewMix ? path.join(staging, "video.mp4") : silent;
    if (hasNewMix) {
      if (options.audio)
        throw new Error(
          "--audio ne peut pas être combiné avec --voice-clips ou --music.",
        );
      await muxSoundtrack(
        silent,
        video,
        result.duration,
        voiceTrack,
        musicTrack,
        sfxTrack,
        options.loudness ?? -16,
        questionTrack,
      );
    } else if (tracks.length)
      await muxAudio(silent, tracks, video, result.duration);
    const info = await mediaInfo(video);
    const videoStream = info.streams.find(
      (stream) => stream.codec_type === "video",
    );
    const audioStream = info.streams.find(
      (stream) => stream.codec_type === "audio",
    );
    const report = {
      duration: Number(info.format.duration),
      videoCodec: videoStream?.codec_name ?? null,
      fps: videoStream?.r_frame_rate ?? null,
      audioCodec: audioStream?.codec_name ?? null,
      sampleRate: audioStream?.sample_rate
        ? Number(audioStream.sample_rate)
        : null,
      channels: audioStream?.channels ?? null,
      hasEditList: await hasEditList(video),
      ...(audioStream
        ? await measureLoudness(video)
        : { integratedLufs: null, truePeakDbfs: null }),
      voiceOverlaps: overlaps,
    };
    if (report.hasEditList)
      compiled.warnings.push("MP4 contains an edit list (elst).");
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
      coverImage
        ? await coverFromImage(
            coverImage.data,
            project.width,
            project.height,
            effectiveTheme.background,
          )
        : await jpeg(project, coverAt),
    );
    await writeFile(
      path.join(staging, "preview.jpg"),
      await makePreview(
        project,
        times,
        options.previewScale,
        options.safeZones,
      ),
    );
    for (let i = 0; i < stillTimes.length; i++)
      await writeFile(
        path.join(staging, stillNames[i]),
        await framePng(project, stillTimes[i], options.crop),
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
      ...stillNames.map((name) => path.join(staging, name)),
      ...(options.soundsOut && questionTrack ? [questionTrack] : []),
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
      report,
      ...(options.verbose ? { previewTimes: times } : {}),
    };
  } catch (error) {
    await Promise.all(published.map((file) => rm(file, { force: true })));
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
