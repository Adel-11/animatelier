import ffmpeg from "ffmpeg-static";
import { quizExamples } from "../packages/core/quiz";
import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffprobe from "@ffprobe-installer/ffprobe";
import { parseProject } from "../packages/core/schema";
import { rasterFrame } from "../packages/headless/frame";
import { renderVideo } from "../packages/headless/video";
import { projectTimeline } from "../packages/core/timeline";
import { newElement } from "../packages/core/elements";
import { elementStates } from "../packages/core/element-state";
import { measureText, wrapText } from "../packages/core/text";
import quiz from "../examples/quiz-list.animatelier.json";
import references from "./fixtures/headless-hashes.json";
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
it("rasterise trois instants avec les polices embarquées, sans polices système", () => {
  const project = parseProject(quiz);
  for (const time of [0, 1.5, 3]) {
    const first = rasterFrame(project, time).pixels;
    expect(hash(first)).toBe(
      references[String(time) as keyof typeof references],
    );
    expect(hash(rasterFrame(project, time).pixels)).toBe(hash(first));
  }
}, 15000);
it("valide formats, flou animé et métriques des textes accentués", () => {
  const project = parseProject({
    ...quiz,
    width: 1080,
    height: 1350,
    fontFamily: "DejaVu Sans Mono",
  });
  expect(rasterFrame(project, 3)).toMatchObject({ width: 1080, height: 1350 });
  for (const type of [
    "rect",
    "ellipse",
    "line",
    "path",
    "text",
    "group",
  ] as const) {
    const element = newElement(type, 2, {
      keyframes: {
        blur: [
          { t: 0, v: 0 },
          { t: 2, v: 20 },
        ],
      },
    });
    expect(elementStates([element], 1)[0].element.blur).toBe(10);
  }
  const e = newElement("group", 2, {
    children: [
      newElement("text", 2, { text: "Été à Montréal", maxWidth: 100 }),
    ],
    keyframes: {
      blur: [
        { t: 0, v: 0 },
        { t: 2, v: 20 },
      ],
    },
  });
  expect(elementStates([e], 1)[0].element.blur).toBe(10);
  expect(() => newElement("rect", 2, { blur: 51 })).toThrow();
  expect(() => parseProject({ ...quiz, width: 10000 })).toThrow();
  const lines = wrapText("Été à Montréal : WWW iii", 24, 130);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.every((line) => measureText(line, 24) <= 130)).toBe(true);
  expect(measureText("WWW", 24)).toBeGreaterThan(measureText("iii", 24));
});
it("exporte les instants globaux et limite les enfants à la présence du groupe", () => {
  const project = parseProject(quiz),
    timeline = projectTimeline(project);
  expect(
    timeline.events
      .filter((e) => e.type === "quiz_answer_reveal")
      .map((e) => e.time),
  ).toEqual([3, 8, 13, 18, 23, 28, 33, 38, 43, 48]);
  project.scenes[0].elements = [
    newElement("group", 4, {
      start: 2,
      children: [newElement("rect", 5, { id: "child" })],
    }),
  ];
  expect(
    projectTimeline(project)
      .events.filter((e) => e.id === "child")
      .map((e) => e.time),
  ).toEqual([2, 4]);
});
it("CLI et workers produisent MP4/WebM à cadence fixe, durée et recadrage exacts", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "animatelier-video-"));
  const project = parseProject({
    ...quiz,
    scenes: [
      {
        ...quiz.scenes[0],
        duration: 1.1,
        actors: [],
        elements: [
          newElement("rect", 1.1, {
            x: 10,
            y: 10,
            keyframes: {
              x: [
                { t: 0, v: 10 },
                { t: 1.1, v: 100 },
              ],
            },
          }),
        ],
      },
    ],
  });
  const source = path.join(directory, "input.json");
  await writeFile(source, JSON.stringify(project));
  const out = path.join(directory, "test.mp4"),
    timeline = path.join(directory, "timeline.json");
  execFileSync(
    process.execPath,
    [
      "apps/cli/render.js",
      source,
      "--out",
      out,
      "--fps",
      "10",
      "--jobs",
      "2",
      "--crop",
      "0,0,640,720",
      "--scale",
      "320x360",
      "--emit-timeline",
      timeline,
    ],
    { timeout: 60000 },
  );
  const probe = (file: string) =>
    JSON.parse(
      execFileSync(
        ffprobe.path,
        ["-v", "error", "-count_frames", "-show_streams", "-of", "json", file],
        { encoding: "utf8" },
      ),
    ).streams[0];
  expect(probe(out)).toMatchObject({
    codec_name: "h264",
    width: 320,
    height: 360,
    avg_frame_rate: "10/1",
    nb_read_frames: "11",
    pix_fmt: "yuv420p",
  });
  expect(Number(probe(out).duration)).toBeCloseTo(1.1, 4);
  const timestamps = JSON.parse(
    execFileSync(
      ffprobe.path,
      ["-v", "error", "-show_frames", "-of", "json", out],
      { encoding: "utf8" },
    ),
  ).frames.map((f: any) => Number(f.best_effort_timestamp_time));
  timestamps.forEach((t: number, i: number) =>
    expect(t).toBeCloseTo(i / 10, 5),
  );
  const second = path.join(directory, "second.mp4");
  await renderVideo(project, {
    out: second,
    fps: 10,
    jobs: 1,
    crop: [0, 0, 640, 720],
    scale: [320, 360],
  });
  const decoded = (file: string) =>
    execFileSync(
      ffmpeg!,
      [
        "-v",
        "error",
        "-i",
        file,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "pipe:1",
      ],
      { maxBuffer: 16_000_000 },
    );
  expect(hash(decoded(second))).toBe(hash(decoded(out)));
  const spec = path.join(directory, "spec.json"),
    compiled = path.join(directory, "compiled.json");
  await writeFile(spec, JSON.stringify(quizExamples.choices));
  execFileSync(process.execPath, ["apps/cli/quiz.js", spec, "-o", compiled]);
  expect(
    parseProject(JSON.parse(await readFile(compiled, "utf8"))).scenes,
  ).toHaveLength(1);
  expect(JSON.parse(await readFile(timeline, "utf8")).duration).toBe(1.1);
  await expect(renderVideo(project, { out })).rejects.toThrow("existante");
  const webm = path.join(directory, "test.webm");
  await renderVideo(project, {
    out: webm,
    format: "webm",
    fps: 10,
    jobs: 1,
    scale: [320, 360],
  });
  expect(probe(webm)).toMatchObject({
    codec_name: "vp9",
    nb_read_frames: "11",
    avg_frame_rate: "10/1",
  });
  await expect(
    renderVideo(project, {
      out: path.join(directory, "bad.mp4"),
      crop: [1200, 0, 200, 100],
    }),
  ).rejects.toThrow("hors canevas");
}, 60000);
