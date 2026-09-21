import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";
import { compileQuiz } from "../packages/core/quiz";
import { sceneElementStates } from "../packages/core/scene-state";
import { flattenElements } from "../packages/core/elements";
import { proxyFor } from "../packages/headless/fetch-assets";
import { remuxAudio } from "../packages/headless/remux";
import { synthesizeSfx, runFfmpeg } from "../packages/headless/audio";
import { coverFromImage } from "../packages/headless/pipeline";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const base = (extra: Record<string, unknown> = {}) => ({
  mode: "levels",
  theme: "qff",
  levels: [
    {
      name: "ONE",
      questions: [
        { q: "What is the capital of Italy?", a: "Rome" },
        {
          q: "Whose logo?",
          a: "Apple",
          image: "asset:logo",
          imageEffect: "pixelate",
        },
      ],
    },
  ],
  assets: {
    logo: {
      mime: "image/png",
      sha256: createHash("sha256")
        .update(Buffer.from(PNG, "base64"))
        .digest("hex"),
      data: PNG,
    },
  },
  ...extra,
});
const elements = (built: ReturnType<typeof compileQuiz>, sceneId: string) =>
  flattenElements(built.project.scenes.find((s) => s.id === sceneId)!.elements);

it("voice mode: countdown starts readPad after the recorded voice, within one frame", () => {
  const durations = { question_1: 1.14, question_2: 2.03 };
  const built = compileQuiz(
    base({ timing: { read: "voice", readPad: 0.3 } }),
    undefined,
    { voiceDurations: durations },
  );
  for (const q of built.timeline.questions) {
    const voiceEnd = q.start + durations[q.id as keyof typeof durations];
    const gap = q.readEnd - voiceEnd;
    expect(gap).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(gap).toBeLessThanOrEqual(0.3 + 1 / 30 + 1e-9);
    const slot = built.voiceScript.find((s) => s.id === q.id)!;
    expect(slot.maxDuration).toBeCloseTo(q.readEnd - q.start, 6);
  }
  expect(() => compileQuiz(base({ timing: { read: "voice" } }))).toThrow(
    /voice durations/,
  );
});

it("per-question read overrides the global value", () => {
  const spec = base({ timing: { read: 4 } });
  (spec.levels[0].questions[0] as any).read = 2;
  const q = compileQuiz(spec).timeline.questions;
  expect(q[0].readEnd - q[0].start).toBeCloseTo(2, 6);
  expect(q[1].readEnd - q[1].start).toBeCloseTo(4, 6);
});

it("say and sayAnswer are copied verbatim into the voice script", () => {
  const spec = base({
    intro: { say: "Welcome to 3 levels!" },
    outro: { say: "Bye 2026" },
  });
  Object.assign(spec.levels[0], { say: "Level one, easy." });
  Object.assign(spec.levels[0].questions[1], {
    say: "Who made this logo?",
    sayAnswer: "Of course, it's Apple!",
  });
  const voice = compileQuiz(spec).voiceScript;
  const text = (id: string) => voice.find((s) => s.id === id)!.text;
  expect(text("intro")).toBe("Welcome to 3 levels!");
  expect(text("outro")).toBe("Bye 2026");
  expect(text("level_1")).toBe("Level one, easy.");
  expect(text("question_2")).toBe("Who made this logo?");
  expect(text("question_2_answer")).toBe("Of course, it's Apple!");
  expect(text("question_1")).toBe(
    "Question one. What is the capital of Italy?",
  );
});

it("French labels: NIVEAU, SUR and RÉPONSE without replacement characters", () => {
  const built = compileQuiz(base({ language: "fr" }));
  const texts = elements(built, "question_1")
    .filter((e) => e.type === "text")
    .map((e) => (e as { text: string }).text.replace(/\n/g, " "));
  expect(texts).toContain("NIVEAU 1 · ONE");
  expect(texts).toContain("QUESTION 1 SUR 2");
  expect(texts).toContain("RÉPONSE");
  expect(JSON.stringify(built.project)).not.toContain("�");
});

it("never shows two countdown digits on the same frame", () => {
  const built = compileQuiz(base());
  for (const q of built.timeline.questions) {
    const scene = built.project.scenes.find((s) => s.id === q.id)!;
    for (let f = 0; f <= Math.round((q.end - q.start) * 30); f++) {
      const visible = sceneElementStates(scene, f / 30).filter(
        (s) => s.visible && s.element.id.startsWith("count_"),
      );
      expect(visible.length).toBeLessThanOrEqual(1);
    }
  }
});

it("hero layout gives a logo at least 700 px wide in 9:16, with an image card", () => {
  const built = compileQuiz(
    base({ imageLayout: "hero", imageCard: { color: "#FFFFFF" } }),
  );
  const els = elements(built, "question_2");
  const image = els.find((e) => e.id === "question_image") as any;
  const card = els.find((e) => e.id === "question_image_card") as any;
  expect(Math.min(image.w, image.h)).toBeGreaterThanOrEqual(700);
  expect(card.fill).toBe("#FFFFFF");
  expect(card.w).toBeGreaterThan(image.w);
  const compact = elements(compileQuiz(base()), "question_2").find(
    (e) => e.id === "question_image",
  ) as any;
  expect(Math.min(compact.w, compact.h)).toBeLessThan(400);
});

it("4:5 multiple choice uses readable choice cards", () => {
  const spec = base({ format: "post-4x5" });
  spec.levels[0].questions[0] = {
    q: "Pick one",
    choices: ["Alpha", "Beta", "Gamma", "Delta"],
    correctIndex: 2,
  } as any;
  const els = elements(compileQuiz(spec), "question_1");
  const choice = els.find((e) => e.id === "choice_0") as any;
  expect(choice.fontSize).toBeGreaterThanOrEqual(40);
  expect(els.some((e) => e.id === "choice_correct_panel_2")).toBe(true);
});

it("proxyFor honours HTTPS_PROXY and NO_PROXY", () => {
  const url = new URL("https://upload.wikimedia.org/a.png");
  expect(proxyFor(url, {})).toBeUndefined();
  expect(proxyFor(url, { HTTPS_PROXY: "http://proxy:3128" })?.host).toBe(
    "proxy:3128",
  );
  expect(
    proxyFor(url, { https_proxy: "proxy:8080", NO_PROXY: ".wikimedia.org" }),
  ).toBeUndefined();
  expect(
    proxyFor(url, { HTTPS_PROXY: "http://p:1", NO_PROXY: "example.com" }),
  ).toBeDefined();
});

it("mux-audio keeps the video packets byte for byte, without elst", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "mux-"));
  const video = path.join(dir, "video.mp4"),
    wav = path.join(dir, "mix.wav"),
    out = path.join(dir, "final.mp4");
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=160x240:rate=30:duration=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-bf",
    "0",
    "-use_editlist",
    "0",
    "-movflags",
    "+faststart",
    video,
  ]);
  await synthesizeSfx(wav, 2, [{ type: "tick", time: 0.5 }]);
  await writeFile(
    path.join(dir, "timeline.json"),
    JSON.stringify({ events: [{ type: "reveal", time: 1 }] }),
  );
  const result = await remuxAudio(video, { audio: wav, out, keepSfx: true });
  expect(result.sfx).toBe("synthesized");
  const packets = (file: string) =>
    execFileSync(ffmpeg!, [
      "-v",
      "error",
      "-i",
      file,
      "-map",
      "0:v",
      "-c",
      "copy",
      "-f",
      "framemd5",
      "-",
    ]).toString();
  expect(packets(out)).toBe(packets(video));
  const bytes = await readFile(out);
  expect(bytes.includes(Buffer.from("elst"))).toBe(false);
  expect(bytes.includes(Buffer.from("mp4a"))).toBe(true);
  await expect(remuxAudio(video, { audio: wav, out })).rejects.toThrow(
    /existante/,
  );
});

it("cover image is fitted on a canvas of the project size", async () => {
  const png = await sharp({
    create: { width: 300, height: 300, channels: 3, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  const jpg = await coverFromImage(
    png.toString("base64"),
    1080,
    1920,
    "#07275F",
  );
  const meta = await sharp(jpg).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1080, 1920]);
});
