import { register } from "tsx/esm/api";
register();
const { parseArgs } = await import("node:util");
const { remuxAudio } = await import("../../packages/headless/remux.ts");
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      audio: { type: "string" },
      out: { type: "string", short: "o" },
      "keep-sfx": { type: "boolean" },
      timeline: { type: "string" },
      sfx: { type: "string" },
    },
  });
  if (positionals.length !== 1 || !values.audio || !values.out)
    throw new Error(
      "node apps/cli/mux-audio.js out/video.mp4 --audio mix.wav --out final.mp4 [--keep-sfx [--timeline out/timeline.json] [--sfx sons.json]]",
    );
  console.log(
    JSON.stringify(
      await remuxAudio(positionals[0], {
        audio: values.audio,
        out: values.out,
        keepSfx: values["keep-sfx"],
        timeline: values.timeline,
        sfx: values.sfx,
      }),
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
