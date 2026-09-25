import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compileQuiz } from "../packages/core/quiz";
import { flattenElements } from "../packages/core/elements";
import {
  synthesizeSfx,
  mixQuestionSounds,
  mediaInfo,
  soundAmplitudes,
} from "../packages/headless/audio";
import { quizVideo } from "../packages/headless/pipeline";

it("inserts a bounded listening phase with readable question and deterministic visualizer", () => {
  const spec = {
    mode: "levels",
    theme: "default",
    intro: { logoSeconds: 0 },
    levels: [
      {
        name: "ONE",
        questions: [
          {
            q: "Which animal?",
            a: "Lion",
            audio: "file:lion.wav",
            revealImage: "file:lion.png",
          },
        ],
      },
    ],
    timing: {
      read: 1,
      listen: 2,
      countdown: 2,
      answer: 1,
      levelCard: 1,
      outro: 1,
    },
  };
  const built = compileQuiz(spec, undefined, {
    soundMetadata: {
      question_1: { duration: 3, amplitudes: [0, 0.8, 0.1, 0.6] },
    },
  });
  const question = built.timeline.questions[0];
  if (!("listenStart" in question))
    throw new Error("Listening timeline missing.");
  expect(question.listenStart).toBe(question.readEnd);
  expect(question.listenEnd! - question.listenStart!).toBeCloseTo(2);
  expect(question.reveal - question.listenEnd!).toBeCloseTo(2);
  const scene = built.project.scenes.find(
    (entry) => entry.id === "question_1",
  )!;
  const elements = flattenElements(scene.elements);
  expect(elements.some((entry) => entry.id === "listen_label")).toBe(true);
  expect(
    elements.some(
      (entry) =>
        entry.id === "question_answer_image" &&
        entry.type === "image" &&
        entry.start === question.reveal - question.start,
    ),
  ).toBe(true);
  expect(
    (elements.find((entry) => entry.id === "question") as any).keyframes.blur[1]
      .t,
  ).toBeCloseTo(question.listenEnd! - question.start);
  expect(
    compileQuiz(spec, undefined, {
      soundMetadata: {
        question_1: { duration: 3, amplitudes: [0, 0.8, 0.1, 0.6] },
      },
    }).project,
  ).toEqual(built.project);
});

it("compiles a ten-row vertical stack with cumulative reveals", () => {
  const spec = {
    mode: "stack",
    title: "Devine les animaux",
    preset: "qff-stack",
    items: Array.from({ length: 10 }, (_, i) => ({
      a: `Animal ${i + 1}`,
      q: `Indice ${i + 1}`,
    })),
  };
  const built = compileQuiz(spec);
  expect(built.project.width).toBe(1080);
  expect(built.project.height).toBe(1920);
  expect(built.project.scenes).toHaveLength(11);
  const fifth = flattenElements(built.project.scenes[4].elements);
  expect(
    fifth.filter((entry) => entry.id.startsWith("row_answer_")),
  ).toHaveLength(5);
  expect(
    (fifth.find((entry) => entry.id === "row_answer_5") as any).start,
  ).toBeGreaterThan(0);
  expect(built.timeline.questions).toHaveLength(10);
  expect(
    flattenElements(built.project.scenes[0].elements).some(
      (entry) => entry.id === "loop_fade_in",
    ),
  ).toBe(true);
  expect(
    flattenElements(built.project.scenes.at(-1)!.elements).some(
      (entry) => entry.id === "loop_fade_out",
    ),
  ).toBe(true);
});

it("withholds per-question answers and schedules a final recap", () => {
  const built = compileQuiz({
    mode: "levels",
    theme: "default",
    revealMode: "end",
    recapSeconds: 1.6,
    levels: [
      {
        name: "ONE",
        questions: [
          { q: "First?", a: "Alpha" },
          { q: "Second?", a: "Beta" },
        ],
      },
    ],
  });
  const first = flattenElements(
    built.project.scenes.find((scene) => scene.id === "question_1")!.elements,
  );
  expect(first.some((entry) => entry.id === "answer")).toBe(false);
  expect(built.project.scenes.some((scene) => scene.id === "recap_1")).toBe(
    true,
  );
  expect(built.project.scenes.some((scene) => scene.id === "recap_2")).toBe(
    true,
  );
  expect(
    built.voiceScript.find((slot) => slot.id === "question_1_answer")?.start,
  ).toBeGreaterThanOrEqual(built.timeline.questions[1].end);
});

it("checks actual audio files and rejects a source outside assetsDir", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "animatelier-sound-test-"));
  try {
    await synthesizeSfx(path.join(dir, "tone.wav"), 1.2, [
      { type: "reveal", time: 0.1 },
    ]);
    const spec = {
      mode: "levels",
      theme: "default",
      levels: [
        {
          name: "ONE",
          questions: [{ q: "Sound?", a: "Tone", audio: "file:tone.wav" }],
        },
      ],
    };
    const result = await quizVideo(spec, { check: true, assetsDir: dir });
    if (!("check" in result)) throw new Error("Check report missing.");
    expect(result.check).toBe(true);
    expect(result.sounds).toHaveLength(1);
    await expect(
      quizVideo(
        {
          ...spec,
          levels: [
            {
              name: "ONE",
              questions: [
                { q: "Sound?", a: "Tone", audio: "file:../tone.wav" },
              ],
            },
          ],
        },
        { check: true, assetsDir: dir },
      ),
    ).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("mixes a timed question-sound stem as 48 kHz stereo PCM", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "animatelier-stem-test-"));
  try {
    const source = path.join(dir, "tone.wav"),
      out = path.join(dir, "sounds.wav");
    await synthesizeSfx(source, 1, [{ type: "reveal", time: 0.1 }]);
    expect(
      Math.max(...(await soundAmplitudes(source, 0.1, 0.3, 4))),
    ).toBeGreaterThan(0.01);
    await mixQuestionSounds(
      [{ file: source, start: 0.5, sourceStart: 0, duration: 0.8, gainDb: 0 }],
      out,
      2,
    );
    const info = await mediaInfo(out);
    expect(
      info.streams.find((stream) => stream.codec_type === "audio")?.sample_rate,
    ).toBe("48000");
    expect(
      info.streams.find((stream) => stream.codec_type === "audio")?.channels,
    ).toBe(2);
    const before = await soundAmplitudes(out, 0, 0.3, 4);
    const during = await soundAmplitudes(out, 0.6, 0.3, 4);
    expect(Math.max(...before)).toBeLessThan(0.001);
    expect(Math.max(...during)).toBeGreaterThan(0.01);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);

it("renders a short stack video with a synchronized sound stem", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "animatelier-stack-render-"));
  try {
    await synthesizeSfx(path.join(dir, "tone.wav"), 1, [
      { type: "reveal", time: 0.1 },
    ]);
    const out = path.join(dir, "out"),
      soundsOut = path.join(out, "sounds.wav");
    const spec = {
      mode: "stack",
      theme: "default",
      title: "Sons",
      timing: { show: 0.3, listen: 0.5, countdown: 0, reveal: 0.7, endHold: 1 },
      items: Array.from({ length: 5 }, (_, i) => ({
        a: `Réponse ${i + 1}`,
        ...(i === 0 ? { audio: "file:tone.wav" } : {}),
      })),
    };
    const result = await quizVideo(spec, {
      out,
      assetsDir: dir,
      draft: true,
      soundsOut,
      music: "default",
    });
    expect(result.outputs).toContain(soundsOut);
    const video = await mediaInfo(path.join(out, "video.mp4"));
    expect(video.streams.some((stream) => stream.codec_type === "video")).toBe(
      true,
    );
    expect(video.streams.some((stream) => stream.codec_type === "audio")).toBe(
      true,
    );
    expect(
      (await mediaInfo(soundsOut)).streams.find(
        (stream) => stream.codec_type === "audio",
      )?.sample_rate,
    ).toBe("48000");
    const audioOut = path.join(dir, "audio-preview");
    const preview = await quizVideo(spec, {
      out: audioOut,
      assetsDir: dir,
      audioPreview: true,
    });
    expect(preview.outputs).toContain(path.join(audioOut, "audio-preview.mp3"));
    expect(
      (await mediaInfo(path.join(audioOut, "audio-preview.mp3"))).streams.some(
        (stream) => stream.codec_type === "video",
      ),
    ).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 120000);
