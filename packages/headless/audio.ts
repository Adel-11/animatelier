import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import ffmpeg from "ffmpeg-static";
import ffprobe from "@ffprobe-installer/ffprobe";
import { z } from "zod";
export const soundSchema = z
  .object({
    frequency: z.number().min(40).max(12000),
    duration: z.number().min(0.01).max(3),
    gain: z.number().min(0).max(0.8).default(0.15),
    sweep: z.number().min(-10000).max(10000).default(0),
  })
  .strict();
export const soundMappingSchema = z.record(soundSchema.nullable());
export type SoundMapping = z.input<typeof soundMappingSchema>;
export const defaultSounds: SoundMapping = {
  tick: { frequency: 1000, duration: 0.065, gain: 0.13 },
  reveal: { frequency: 660, duration: 0.32, sweep: 440, gain: 0.2 },
  level: { frequency: 220, duration: 0.65, sweep: 880, gain: 0.16 },
  question: { frequency: 150, duration: 0.16, sweep: 700, gain: 0.07 },
};
export async function runFfmpeg(args: string[]) {
  const child = spawn(
    process.env.ANIMATELIER_FFMPEG || ffmpeg || "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-nostdin", ...args],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  let errors = "";
  child.stderr.on("data", (chunk) => {
    errors = (errors + chunk).slice(-8000);
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg (${code}): ${errors}`)),
    );
  });
}
export async function mediaInfo(filename: string) {
  const child = spawn(
    ffprobe.path,
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", filename],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "",
    error = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    error += chunk;
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffprobe: ${error}`)),
    );
  });
  return JSON.parse(output) as {
    format: { duration?: string };
    streams: {
      codec_type: string;
      codec_name: string;
      r_frame_rate?: string;
      sample_rate?: string;
      channels?: number;
    }[];
  };
}
export async function audioDuration(filename: string) {
  const info = await mediaInfo(filename);
  if (!info.streams.some((stream) => stream.codec_type === "audio"))
    throw new Error(`Piste audio absente : ${filename}`);
  const duration = Number(info.format.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600)
    throw new Error(`Durée audio invalide : ${filename}`);
  return duration;
}
export async function measureLoudness(filename: string) {
  const child = spawn(
    process.env.ANIMATELIER_FFMPEG || ffmpeg || "ffmpeg",
    [
      "-hide_banner",
      "-nostdin",
      "-i",
      filename,
      "-filter_complex",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  let output = "";
  child.stderr.on("data", (chunk) => {
    output = (output + chunk).slice(-20000);
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Loudness analysis failed: ${output.slice(-2000)}`)),
    );
  });
  const integrated = [...output.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)].at(
    -1,
  );
  const truePeak = [...output.matchAll(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g)].at(
    -1,
  );
  return {
    integratedLufs: integrated ? Number(integrated[1]) : null,
    truePeakDbfs: truePeak ? Number(truePeak[1]) : null,
  };
}
export type VoiceClip = {
  id: string;
  file: string;
  start: number;
  duration: number;
};
export async function synthesizeMusic(
  filename: string,
  duration: number,
  options: { bpm: number; root: number; progression: number[] },
) {
  const rate = 48000,
    frames = Math.ceil(duration * rate);
  if (frames < 1 || frames > rate * 3600)
    throw new Error("Durée musicale hors limites.");
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(frames * 4 + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(frames * 4, 40);
  const file = await open(filename, "wx");
  const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
  const beat = 60 / options.bpm;
  try {
    await file.writeFile(header);
    for (let offset = 0; offset < frames; offset += rate) {
      const count = Math.min(rate, frames - offset),
        bytes = Buffer.alloc(count * 4);
      for (let i = 0; i < count; i++) {
        const time = (offset + i) / rate,
          measure = Math.floor(time / (beat * 4));
        const root =
          options.root +
          options.progression[measure % options.progression.length];
        const chord = [root, root + 4, root + 7].reduce(
          (sum, midi, n) =>
            sum + Math.sin(2 * Math.PI * frequency(midi) * time + n) * 0.035,
          0,
        );
        const bass = Math.sin(2 * Math.PI * frequency(root - 12) * time) * 0.09;
        const pulse =
          Math.exp(-((time % beat) / 0.11)) *
          Math.sin(2 * Math.PI * 70 * time) *
          0.09;
        const value = Math.round(
          Math.max(-1, Math.min(1, chord + bass + pulse)) * 32767,
        );
        bytes.writeInt16LE(value, i * 4);
        bytes.writeInt16LE(value, i * 4 + 2);
      }
      await file.writeFile(bytes);
    }
  } finally {
    await file.close();
  }
}
/** Places voice clips on a fixed timeline; the mix is filtered once before final muxing. */
export async function mixVoiceClips(
  clips: VoiceClip[],
  out: string,
  duration: number,
) {
  if (!clips.length) throw new Error("Aucun clip vocal à mixer.");
  const inputs = clips.flatMap((clip) => ["-i", clip.file]);
  const parts = clips.map(
    (clip, i) =>
      `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=80,acompressor=threshold=0.1:ratio=3,adelay=${Math.round(clip.start * 1000)}:all=1[v${i}]`,
  );
  const labels = clips.map((_, i) => `[v${i}]`).join("");
  await runFfmpeg([
    ...inputs,
    "-filter_complex",
    `${parts.join(";")};${labels}amix=inputs=${clips.length}:duration=longest:normalize=0,apad,atrim=duration=${duration},alimiter=limit=0.95[a]`,
    "-map",
    "[a]",
    "-c:a",
    "pcm_s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-n",
    out,
  ]);
}
export async function muxSoundtrack(
  video: string,
  out: string,
  duration: number,
  voice?: string,
  music?: string,
  sfx?: string,
  loudness = -16,
) {
  const inputs = [voice, music, sfx].filter((x): x is string => !!x);
  if (!inputs.length) throw new Error("Piste audio requise.");
  const index = (file: string | undefined) =>
    file ? inputs.indexOf(file) + 1 : -1;
  const parts: string[] = [];
  let musicLabel = "";
  if (music) {
    const fadeStart = Math.max(0, duration - 2);
    parts.push(
      `[${index(music)}:a]atrim=duration=${duration},asetpts=N/SR/TB,afade=t=out:st=${fadeStart}:d=${Math.min(2, duration)},volume=6dB[music]`,
    );
    musicLabel = "[music]";
  }
  if (voice) {
    parts.push(
      `[${index(voice)}:a]atrim=duration=${duration},asetpts=N/SR/TB[voice]`,
    );
    if (music) {
      parts.push("[voice]asplit=2[voice_mix][voice_side]");
      parts.push(
        `${musicLabel}[voice_side]sidechaincompress=threshold=0.04:ratio=6:attack=40:release=400[duck]`,
      );
      musicLabel = "[duck]";
    }
  }
  const labels = [
    voice ? (music ? "[voice_mix]" : "[voice]") : "",
    musicLabel,
    sfx ? `[${index(sfx)}:a]` : "",
  ].filter(Boolean);
  parts.push(
    `${labels.join("")}amix=inputs=${labels.length}:duration=longest:normalize=0,apad,atrim=duration=${duration},loudnorm=I=${loudness}:TP=-1.5:LRA=11,alimiter=limit=0.95[a]`,
  );
  await runFfmpeg([
    "-i",
    video,
    ...inputs.flatMap((file) => [
      ...(file === music ? ["-stream_loop", "-1"] : []),
      "-i",
      file,
    ]),
    "-filter_complex",
    parts.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    String(duration),
    "-use_editlist",
    "0",
    "-movflags",
    "+faststart",
    "-n",
    out,
  ]);
}
/** Deterministic stereo PCM synthesis in bounded one-second chunks. */
export async function synthesizeSfx(
  filename: string,
  duration: number,
  events: { type: string; time: number }[],
  mapping: SoundMapping = {},
) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600)
    throw new Error("Durée audio hors limites (0–3600 s).");
  const sounds = soundMappingSchema.parse({ ...defaultSounds, ...mapping });
  const rate = 48000,
    frames = Math.ceil(duration * rate),
    size = frames * 4;
  const tones = events
    .filter(
      (e) =>
        sounds[e.type] &&
        Number.isFinite(e.time) &&
        e.time >= 0 &&
        e.time < duration,
    )
    .map((e) => ({ start: e.time, sound: sounds[e.type]! }));
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(size + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(size, 40);
  const file = await open(filename, "wx");
  try {
    await file.writeFile(header);
    for (let offset = 0; offset < frames; offset += rate) {
      const n = Math.min(rate, frames - offset),
        bytes = Buffer.alloc(n * 4);
      const active = tones.filter(
        (t) =>
          t.start < (offset + n) / rate &&
          t.start + t.sound.duration > offset / rate,
      );
      for (let i = 0; i < n; i++) {
        let value = 0;
        for (const tone of active) {
          const t = (offset + i) / rate - tone.start,
            s = tone.sound;
          if (t < 0 || t >= s.duration) continue;
          const envelope = Math.min(1, t / 0.005) * (1 - t / s.duration) ** 2;
          value +=
            s.gain *
            envelope *
            Math.sin(
              2 *
                Math.PI *
                (s.frequency * t + (s.sweep * t * t) / (2 * s.duration)),
            );
        }
        const sample = Math.round(Math.max(-1, Math.min(1, value)) * 32767);
        bytes.writeInt16LE(sample, i * 4);
        bytes.writeInt16LE(sample, i * 4 + 2);
      }
      await file.writeFile(bytes);
    }
  } finally {
    await file.close();
  }
}
export async function muxAudio(
  video: string,
  audio: string[],
  out: string,
  duration: number,
) {
  if (!audio.length) throw new Error("Piste audio requise.");
  const labels = audio.map((_, i) => `[${i + 1}:a]`).join("");
  const filter =
    audio.length === 1
      ? "[1:a]apad[a]"
      : `${labels}amix=inputs=${audio.length}:duration=longest:normalize=0,alimiter=limit=0.95,apad[a]`;
  await runFfmpeg([
    "-i",
    video,
    ...audio.flatMap((a) => ["-i", a]),
    "-filter_complex",
    filter,
    "-map",
    "0:v:0",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    String(duration),
    "-use_editlist",
    "0",
    "-avoid_negative_ts",
    "disabled",
    "-movflags",
    "+faststart",
    "-n",
    out,
  ]);
}
/** Reads container duration and whether an audio stream exists, from ffmpeg's banner. */
export async function probeMedia(file: string) {
  const child = spawn(
    process.env.ANIMATELIER_FFMPEG || ffmpeg || "ffmpeg",
    ["-hide_banner", "-nostdin", "-i", file],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  let info = "";
  child.stderr.on("data", (chunk) => {
    info = (info + chunk).slice(-20000);
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve());
  });
  const m = info.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m || !/Stream #0:\d+.*: Video:/.test(info))
    throw new Error(`Vidéo illisible : ${file}`);
  return {
    duration: +m[1] * 3600 + +m[2] * 60 + +m[3],
    hasAudio: /Stream #0:\d+.*: Audio:/.test(info),
  };
}
