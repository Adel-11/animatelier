import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import ffmpeg from "ffmpeg-static";
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
