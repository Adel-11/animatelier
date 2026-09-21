import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffprobe from "@ffprobe-installer/ffprobe";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";
import { parseProject } from "../packages/core/schema";
import { createFrameRasterizer, rasterFrame } from "../packages/headless/frame";
import { renderVideo, defaultRenderJobs } from "../packages/headless/video";
import { muxAudio, synthesizeSfx } from "../packages/headless/audio";
import {
  makePreview,
  previewTimes,
  quizVideo,
} from "../packages/headless/pipeline";
const project = () =>
  parseProject({
    schemaVersion: 2,
    id: "test",
    name: "Test",
    width: 160,
    height: 240,
    fps: 12,
    scenes: [
      {
        id: "scene",
        name: "Test",
        duration: 1,
        background: "studio",
        title: "",
        actors: [],
        elements: [],
      },
    ],
  });
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function boxes(bytes: Buffer, start = 0, end = bytes.length): string[] {
  const result: string[] = [];
  for (let offset = start; offset + 8 <= end;) {
    let size = bytes.readUInt32BE(offset),
      header = 8;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (size === 1) {
      size = Number(bytes.readBigUInt64BE(offset + 8));
      header = 16;
    }
    if (size === 0) size = end - offset;
    if (size < header || offset + size > end) throw new Error("MP4 invalide");
    result.push(type);
    if (["moov", "trak", "mdia", "minf", "stbl", "edts"].includes(type))
      result.push(...boxes(bytes, offset + header, offset + size));
    offset += size;
  }
  return result;
}
it("réutilise un raster SVG identique, sans modifier les pixels ni retenir toutes les images", () => {
  const p = project(),
    cached = createFrameRasterizer(p);
  expect(hash(cached.render(0))).toBe(hash(rasterFrame(p, 0).pixels));
  expect(hash(cached.render(0.1))).toBe(hash(rasterFrame(p, 0.1).pixels));
  expect(cached.stats()).toEqual({ rasterized: 1, reused: 1 });
  p.scenes[0].title = "Changement";
  cached.render(0.2);
  expect(cached.stats()).toEqual({ rasterized: 2, reused: 1 });
  expect(defaultRenderJobs(1080, 1920)).toBeGreaterThanOrEqual(1);
  expect(defaultRenderJobs(1080, 1920)).toBeLessThanOrEqual(16);
});
it("produit MP4 Instagram CFR30 sans elst et ajoute AAC48k stéréo sans réencodage vidéo", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "quiz-pipeline-"));
  const silent = path.join(dir, "silent.mp4"),
    audio = path.join(dir, "sfx.wav"),
    final = path.join(dir, "video.mp4");
  const result = await renderVideo(project(), {
    out: silent,
    target: "instagram-reel",
    jobs: 2,
  });
  expect(result).toMatchObject({ fps: 30, frames: 30, duration: 1 });
  const events = [
    { type: "tick", time: 0.1 },
    { type: "reveal", time: 0.5 },
  ];
  await synthesizeSfx(audio, 1, events);
  const other = path.join(dir, "sfx2.wav");
  await synthesizeSfx(other, 1, events);
  expect(hash(await readFile(audio))).toBe(hash(await readFile(other)));
  await muxAudio(silent, [audio], final, 1);
  const probe = JSON.parse(
    execFileSync(
      ffprobe.path,
      ["-v", "error", "-show_streams", "-show_frames", "-of", "json", final],
      { encoding: "utf8" },
    ),
  );
  expect(probe.streams[0]).toMatchObject({
    codec_name: "h264",
    profile: "High",
    pix_fmt: "yuv420p",
    avg_frame_rate: "30/1",
    r_frame_rate: "30/1",
    nb_frames: "30",
  });
  expect(probe.streams[1]).toMatchObject({
    codec_name: "aac",
    sample_rate: "48000",
    channels: 2,
  });
  expect(Math.abs(Number(probe.streams[0].duration) - 1)).toBeLessThanOrEqual(
    1 / 30,
  );
  const frames = probe.frames.filter((f: any) => f.media_type === "video");
  frames.forEach((f: any, i: number) =>
    expect(
      Number(f.best_effort_timestamp_time) -
        Number(frames[0].best_effort_timestamp_time),
    ).toBeCloseTo(i / 30, 5),
  );
  for (const file of [silent, final])
    expect(boxes(await readFile(file))).not.toContain("elst");
  const packets = (file: string) =>
    execFileSync(ffmpeg!, [
      "-v",
      "error",
      "-i",
      file,
      "-map",
      "0:v:0",
      "-c:v",
      "copy",
      "-f",
      "h264",
      "pipe:1",
    ]);
  expect(hash(packets(final))).toBe(hash(packets(silent)));
  await expect(renderVideo(project(), { out: silent })).rejects.toThrow(
    "existante",
  );
}, 60000);
it("valide les instants et produit une planche JPEG déterministe", async () => {
  expect(() => previewTimes("1", 1, [])).toThrow();
  expect(() => previewTimes("bad", 2, [])).toThrow();
  expect(previewTimes("auto", 1, [])).toEqual([0.5]);
  const a = await makePreview(project(), [0, 0.5]),
    b = await makePreview(project(), [0, 0.5]);
  expect(hash(a)).toBe(hash(b));
  expect(await sharp(a).metadata()).toMatchObject({
    format: "jpeg",
    width: 540,
    height: 405,
  });
});
it("valide --check sans sortie et publie les six artefacts avec refus d’écrasement", async () => {
  const spec = {
    mode: "choices",
    title: "Test",
    revealDelay: 0.5,
    answerDuration: 0.5,
    questions: [{ question: "2+2?", choices: ["3", "4"], correctIndex: 1 }],
  };
  const check = await quizVideo(spec, { check: true });
  expect(check).toMatchObject({ check: true, duration: 1, frames: 30 });
  const out = await mkdtemp(path.join(tmpdir(), "quiz-artifacts-"));
  await quizVideo(spec, { out, jobs: 1, preview: "0,.5", coverAt: 0 });
  for (const name of [
    "video.mp4",
    "project.json",
    "timeline.json",
    "voice-script.json",
    "cover.jpg",
    "preview.jpg",
  ])
    expect((await stat(path.join(out, name))).size).toBeGreaterThan(0);
  expect(await sharp(path.join(out, "cover.jpg")).metadata()).toMatchObject({
    format: "jpeg",
  });
  const before = await readFile(path.join(out, "video.mp4"));
  await expect(quizVideo(spec, { out })).rejects.toThrow("existante");
  expect(hash(await readFile(path.join(out, "video.mp4")))).toBe(hash(before));
}, 60000);
it("résout le kit QFF et les images de questions depuis des racines distinctes en --check", async () => {
  const assetsDir = await mkdtemp(path.join(tmpdir(), "quiz-assets-"));
  await sharp({
    create: { width: 16, height: 16, channels: 3, background: "red" },
  })
    .png()
    .toFile(path.join(assetsDir, "question.png"));
  const spec = {
    mode: "levels",
    theme: "qff",
    levels: [
      {
        name: "ROOKIE",
        questions: [
          {
            q: "Which color?",
            a: "Red",
            image: "file:question.png",
            imageEffect: "pixelate",
          },
        ],
      },
    ],
  };
  expect(await quizVideo(spec, { check: true, assetsDir })).toMatchObject({
    check: true,
  });
  const source = path.join(assetsDir, "spec.json");
  await writeFile(source, JSON.stringify(spec));
  const cli = path.resolve("apps/cli/quiz-video.js");
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [cli, source, "--check", "--assets-dir", assetsDir],
      { cwd: assetsDir, encoding: "utf8" },
    ),
  );
  expect(result.check).toBe(true);
});
