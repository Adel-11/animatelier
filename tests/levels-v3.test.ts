import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";
import { compileQuiz } from "../packages/core/quiz";
import { compileLevels } from "../packages/core/levels";
import { sceneElementStates } from "../packages/core/scene-state";
import { flattenElements } from "../packages/core/elements";
import { proxyFor } from "../packages/headless/fetch-assets";
import { remuxAudio } from "../packages/headless/remux";
import { synthesizeSfx, runFfmpeg } from "../packages/headless/audio";
import { coverFromImage, quizVideo } from "../packages/headless/pipeline";
import { renderProjectSvg } from "../packages/renderer/svg";
import {
  mixVoiceClips,
  muxSoundtrack,
  mediaInfo,
  measureLoudness,
  synthesizeMusic,
} from "../packages/headless/audio";

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

it("uses identical pill geometry and label size on level and question SVG", () => {
  const built = compileLevels(base({ theme: "default" }));
  const card = elements(built, "level_1");
  const question = elements(built, "question_1");
  const bar = (list: typeof card, id: string) =>
    list.find((e) => e.id === id) as any;
  expect([
    bar(card, "card_progress_0_0").h,
    bar(card, "card_progress_0_0").radius,
  ]).toEqual([
    bar(question, "progress_0_0").h,
    bar(question, "progress_0_0").radius,
  ]);
  expect(bar(card, "card_progress_label_0").fontSize).toBe(
    bar(question, "progress_label_0").fontSize,
  );
  const cardSvg = renderProjectSvg(
    built.project,
    built.timeline.levels[0].start + 0.1,
  );
  const questionSvg = renderProjectSvg(
    built.project,
    built.timeline.questions[0].start + 0.1,
  );
  const rect = (svg: string, id: string) =>
    svg.match(new RegExp(`data-element-id="${id}"[^>]*><rect[^>]*>`))?.[0];
  expect(rect(cardSvg, "card_progress_0_0")).toContain('rx="11" ry="11"');
  expect(rect(questionSvg, "progress_0_0")).toContain('rx="11" ry="11"');
});

it("extends every narrated slot without changing specs that omit durations", () => {
  const baseline = compileLevels(base());
  const built = compileLevels(base(), undefined, {
    voiceDurations: { intro: 6, level_1: 4, question_1_answer: 5, outro: 10 },
  });
  expect(built.timeline.intro.end - built.timeline.intro.start).toBeGreaterThan(
    baseline.timeline.intro.end - baseline.timeline.intro.start,
  );
  expect(
    built.timeline.levels[0].end - built.timeline.levels[0].start,
  ).toBeGreaterThanOrEqual(4.3);
  expect(
    built.timeline.questions[0].end - built.timeline.questions[0].reveal,
  ).toBeGreaterThanOrEqual(5.4);
  expect(built.timeline.outro.end - built.timeline.outro.start).toBeCloseTo(
    10.3,
    5,
  );
});

it("expands preset, cascaded defaults, deterministic QCM, voice templates and custom scenes", () => {
  const spec = {
    preset: "qff-reel",
    voice: {
      seed: 3,
      answerTemplates: ["It's {a}."],
      pronounce: { Rome: "Roam" },
    },
    defaults: { imageEffect: "blur" },
    levels: [
      {
        questions: [
          {
            q: "Capital?",
            a: "Rome",
            wrong: ["Paris", "Berlin"],
            elements: [{ id: "spark", type: "ellipse", x: 30, y: 40 }],
          },
        ],
      },
    ],
    sequence: [
      {
        after: "intro",
        id: "mid_card",
        duration: 2,
        say: "Bonus",
        elements: [
          {
            id: "mid_text",
            type: "text",
            text: "Hello <agent>",
            x: 100,
            y: 200,
          },
        ],
      },
    ],
    layout: {
      question_panel: { x: 0.1, visible: false },
      "progress_label_*": { fontSize: 30 },
    },
  };
  const built = compileLevels(spec);
  expect(built.project.scenes.some((scene) => scene.id === "mid_card")).toBe(
    true,
  );
  expect(built.timeline.questions[0].start).toBeGreaterThan(2);
  const q = elements(built, "question_1");
  expect(q.some((e) => e.id === "spark")).toBe(true);
  expect((q.find((e) => e.id === "question_panel") as any).opacity).toBe(0);
  expect(
    built.layoutReport.find(
      (item) => item.scene === "question_1" && item.id === "progress_label_0",
    )?.fontSize,
  ).toBe(30);
  expect(
    built.voiceScript.find((slot) => slot.id === "question_1_answer")?.text,
  ).toBe("It's Roam.");
  expect(
    renderProjectSvg(
      built.project,
      built.timeline.events.find((e) => e.id === "mid_card")!.time + 0.1,
    ),
  ).toContain("Hello &lt;agent&gt;");
  expect(() =>
    compileQuiz({
      ...spec,
      sequence: [{ after: "missing", id: "bad", duration: 2 }],
    }),
  ).toThrow(/Unknown sequence anchor/);
});

it("supports fractional image crop, progressive reveal and answer image without external SVG", () => {
  const spec = base({ theme: "default" });
  Object.assign(spec.levels[0].questions[1], {
    crop: { x: 0.2, y: 0, w: 0.5, h: 1 },
    imageEffect: { type: "blur", from: 18, to: 0, ease: "easeOut" },
    answerImage: "asset:logo",
  });
  const built = compileLevels(spec);
  const image = elements(built, "question_2").find(
    (e) => e.id === "question_image",
  ) as any;
  expect(image.crop).toEqual({ x: 0.2, y: 0, w: 0.5, h: 1 });
  expect(image.keyframes.blur[2].ease).toBe("easeOut");
  expect(
    elements(built, "question_2").some((e) => e.id === "question_answer_image"),
  ).toBe(true);
  const svg = renderProjectSvg(
    built.project,
    built.timeline.questions[1].start + 0.1,
  );
  expect(svg).toMatch(/viewBox="[^"]+"/);
  expect(() =>
    compileLevels({
      ...spec,
      levels: [
        {
          ...spec.levels[0],
          questions: [
            {
              q: "Bad",
              a: "x",
              image: "asset:logo",
              crop: { x: 0.8, y: 0, w: 0.5, h: 1 },
            },
          ],
        },
      ],
    }),
  ).toThrow();
});

it("places an animated presenter and custom v2 actors in vertical level scenes", () => {
  const spec = base({
    presenter: { name: "Camille", dialogue: "answer" },
    sequence: [
      {
        after: "question_1",
        id: "host_card",
        duration: 2,
        actors: [
          { id: "guest", name: "Guest", x: 320, y: 850, action: "wave" },
        ],
      },
    ],
  });
  const built = compileLevels(spec);
  const scene = built.project.scenes.find((s) => s.id === "question_1")!;
  expect(scene.actors[0].name).toBe("Camille");
  expect(scene.actors[0].timeline[1].dialogue).toBe("Rome");
  expect(
    built.project.scenes.find((s) => s.id === "host_card")?.actors[0].id,
  ).toBe("guest");
});

it("keeps the outro range separate from a custom scene inserted after it", () => {
  const original = compileLevels(base());
  const built = compileLevels(
    base({ sequence: [{ after: "outro", id: "credits", duration: 2 }] }),
  );
  expect(built.timeline.outro).toEqual(original.timeline.outro);
  expect(built.duration - original.duration).toBeCloseTo(2, 5);
});

it("mixes a real voice clip and music into a measurable MP4", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "quiz-voice-"));
  const video = path.join(dir, "silent.mp4"),
    wav = path.join(dir, "voice.wav"),
    music = path.join(dir, "music.wav"),
    mix = path.join(dir, "mix.wav"),
    out = path.join(dir, "final.mp4"),
    ducked = path.join(dir, "ducked.mp4"),
    musicOnly = path.join(dir, "music-only.mp4");
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=160x240:r=15:d=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-use_editlist",
    "0",
    video,
  ]);
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=0.5",
    "-c:a",
    "pcm_s16le",
    wav,
  ]);
  await synthesizeMusic(music, 2, {
    bpm: 112,
    root: 48,
    progression: [0, 5, 9, 7],
  });
  await mixVoiceClips(
    [{ id: "intro", file: wav, start: 0.3, duration: 0.5 }],
    mix,
    2,
  );
  await muxSoundtrack(video, out, 2, mix);
  await muxSoundtrack(video, ducked, 2, mix, music);
  await muxSoundtrack(video, musicOnly, 2, undefined, music);
  const info = await mediaInfo(out);
  expect(info.streams.some((stream) => stream.codec_type === "audio")).toBe(
    true,
  );
  expect((await readFile(out)).includes(Buffer.from("elst"))).toBe(false);
  const loudness = await measureLoudness(out);
  expect(loudness.integratedLufs).not.toBeNull();
  expect(loudness.truePeakDbfs).not.toBeNull();
  expect(
    (await mediaInfo(ducked)).streams.some(
      (stream) => stream.codec_type === "audio",
    ),
  ).toBe(true);
  expect(
    (await mediaInfo(musicOnly)).streams.some(
      (stream) => stream.codec_type === "audio",
    ),
  ).toBe(true);
});

it("measures clip filenames and extends the pipeline timeline in --check", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "quiz-clips-"));
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:duration=6",
    "-c:a",
    "pcm_s16le",
    path.join(dir, "intro.wav"),
  ]);
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-c:a",
    "pcm_s16le",
    path.join(dir, "question_1.wav"),
  ]);
  const check = await quizVideo(
    base({ theme: "default", timing: { read: "voice", readPad: 0.3 } }),
    { voiceClips: dir, check: true },
  );
  expect(check.duration).toBeGreaterThan(22);
  expect(
    check.warnings.some((warning) =>
      warning.includes("Voice clip missing: intro.wav"),
    ),
  ).toBe(false);
  expect(
    check.warnings.some((warning) =>
      warning.includes("Voice clip missing: question_2.wav"),
    ),
  ).toBe(true);
});

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
