import path from "node:path";
import os from "node:os";
import { lstat, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import {
  muxAudio,
  probeMedia,
  synthesizeSfx,
  soundMappingSchema,
} from "./audio";
export interface RemuxOptions {
  audio: string;
  out: string;
  keepSfx?: boolean;
  timeline?: string;
  sfx?: string;
}
/**
 * Adds an audio track to an already rendered MP4 without touching the video stream
 * (packets copied as is). Instagram profile: AAC 128 kb/s, 48 kHz stereo, no elst, faststart.
 * keepSfx mixes the audio already present in the video (sound effects of a previous
 * --sfx render), or synthesizes them again from timeline.json when the video is silent.
 */
export async function remuxAudio(video: string, options: RemuxOptions) {
  const input = path.resolve(video),
    out = path.resolve(options.out);
  if (input === out) throw new Error("--out doit différer de la vidéo source.");
  await stat(options.audio);
  try {
    await lstat(out);
    throw new Error(`Sortie existante : ${out}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const media = await probeMedia(input);
  const tracks = [path.resolve(options.audio)];
  const temp = await mkdtemp(path.join(os.tmpdir(), "animatelier-mux-"));
  try {
    if (options.keepSfx) {
      if (media.hasAudio) tracks.push(input);
      else {
        const timelineFile =
          options.timeline ?? path.join(path.dirname(input), "timeline.json");
        if ((await stat(timelineFile)).size > 5_000_000)
          throw new Error("timeline.json supérieur à 5 Mo.");
        const timeline = JSON.parse(await readFile(timelineFile, "utf8"));
        if (!Array.isArray(timeline?.events))
          throw new Error("timeline.json sans événements.");
        const mapping =
          options.sfx && options.sfx !== "default"
            ? soundMappingSchema.parse(
                JSON.parse(await readFile(options.sfx, "utf8")),
              )
            : {};
        const wav = path.join(temp, "sfx.wav");
        await synthesizeSfx(wav, media.duration, timeline.events, mapping);
        tracks.push(wav);
      }
    }
    await muxAudio(input, tracks, out, media.duration);
    return {
      path: out,
      duration: media.duration,
      tracks: tracks.length,
      sfx: options.keepSfx
        ? media.hasAudio
          ? "existing-track"
          : "synthesized"
        : "none",
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
