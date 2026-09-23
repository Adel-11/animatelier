import { register } from "tsx/esm/api";
register();
const { parseArgs } = await import("node:util");
const { readFile, stat } = await import("node:fs/promises");
const { quizVideo } = await import("../../packages/headless/pipeline.ts");
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      theme: { type: "string" },
      preset: { type: "string" },
      jobs: { type: "string" },
      "assets-dir": { type: "string" },
      target: { type: "string" },
      audio: { type: "string" },
      sfx: { type: "string" },
      cover: { type: "string" },
      "cover-at": { type: "string" },
      "cover-image": { type: "string" },
      "voice-durations": { type: "string" },
      "voice-clips": { type: "string" },
      music: { type: "string" },
      loudness: { type: "string" },
      verbose: { type: "boolean" },
      "preview-only": { type: "boolean" },
      "preview-scale": { type: "string" },
      frames: { type: "string" },
      crop: { type: "string" },
      draft: { type: "boolean" },
      schema: { type: "boolean" },
      preview: { type: "string" },
      check: { type: "boolean" },
    },
  });
  if (values.schema) {
    console.log(
      JSON.stringify({
        mode: "levels",
        required: {
          levels: "1..10 levels, each with 1..30 questions; max 60 total",
          question: "q + a OR choices[2..4] + correctIndex",
        },
        optional: {
          preset: "qff-reel or --preset file.json",
          theme: "name or object",
          format: "reel-9x16|post-4x5|landscape",
          timing:
            "read:auto|voice|seconds, readPad:0.3, countdown:4, answer:2.4, levelCard:2.2, outro:7",
          voice:
            "offsets, min, pad, seed, answerTemplates, questionPrefixes, pronounce",
          music: "bpm, root MIDI pitch, progression semitone offsets",
          imageEffect: "none|blur|pixelate|zoom or {type,from,to,ease}",
          image: "file: or asset:, answerImage, crop{x,y,w,h}",
          choicesLayout: "grid|list|two|overlay",
          type: "standard|true-false|odd-one-out|estimate",
          countdownStyle: "ring|bar|digits",
          layout: "element-id or prefix*, normalized x/y/w/h and style",
          sequence: "{after,id,duration,elements,actors,say}[]",
          presenter: "actor config",
          defaults: "root/level question defaults",
        },
        cli: [
          "--voice-clips DIR",
          "--music FILE|default",
          "--loudness -16",
          "--preview-only",
          "--preview-scale 0.5",
          "--frames 12.5,52.9",
          "--crop x,y,w,h",
          "--draft",
          "--check",
          "--verbose",
        ],
      }),
    );
    process.exit(0);
  }
  if (positionals.length !== 1 || (!values.out && !values.check))
    throw new Error(
      "node apps/cli/quiz-video.js spec.json --out out/ [--voice-clips clips/] [--music file.wav|default] [--preview-only] [--frames 12.5,52.9] [--check] ; --schema for fields",
    );
  if (values.target && values.target !== "instagram-reel")
    throw new Error("Cible inconnue.");
  if (
    values.jobs &&
    (!/^\d+$/.test(values.jobs) || +values.jobs < 1 || +values.jobs > 16)
  )
    throw new Error("--jobs doit être compris entre 1 et 16.");
  const crop = values.crop?.split(",").map(Number);
  if (crop && (crop.length !== 4 || crop.some((n) => !Number.isInteger(n))))
    throw new Error("--crop attend x,y,w,h entiers.");
  if ((await stat(positionals[0])).size > 5_000_000)
    throw new Error("Spec supérieure à 5 Mo.");
  const result = await quizVideo(
    JSON.parse(await readFile(positionals[0], "utf8")),
    {
      ...values,
      jobs: values.jobs ? Number(values.jobs) : undefined,
      assetsDir: values["assets-dir"],
      coverImage: values["cover-image"],
      voiceDurations: values["voice-durations"],
      voiceClips: values["voice-clips"],
      music: values.music,
      loudness:
        values.loudness === undefined ? undefined : Number(values.loudness),
      verbose: values.verbose,
      previewOnly: values["preview-only"],
      previewScale:
        values["preview-scale"] === undefined
          ? undefined
          : Number(values["preview-scale"]),
      frames: values.frames,
      crop,
      draft: values.draft,
      coverAt:
        values["cover-at"] === undefined
          ? undefined
          : Number(values["cover-at"]),
    },
    (frame, total) => {
      const percent = Math.floor((frame * 10) / total);
      if (
        frame === total ||
        (percent > 0 && percent > (globalThis.lastProgressBucket ?? 0))
      ) {
        globalThis.lastProgressBucket = percent;
        console.error(`${Math.min(100, percent * 10)}%`);
      }
    },
  );
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
