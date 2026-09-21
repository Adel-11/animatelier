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
      jobs: { type: "string" },
      "assets-dir": { type: "string" },
      target: { type: "string" },
      audio: { type: "string" },
      sfx: { type: "string" },
      cover: { type: "string" },
      "cover-at": { type: "string" },
      preview: { type: "string" },
      check: { type: "boolean" },
    },
  });
  if (positionals.length !== 1 || (!values.out && !values.check))
    throw new Error(
      "node apps/cli/quiz-video.js spec.json --out out/ [--theme qff] [--assets-dir .] [--jobs 4] [--target instagram-reel] [--audio mix.wav] [--sfx default] [--cover cover.jpg --cover-at 1] [--preview auto|1,4,8] [--check]",
    );
  if (values.target && values.target !== "instagram-reel")
    throw new Error("Cible inconnue.");
  if (
    values.jobs &&
    (!/^\d+$/.test(values.jobs) || +values.jobs < 1 || +values.jobs > 16)
  )
    throw new Error("--jobs doit être compris entre 1 et 16.");
  if ((await stat(positionals[0])).size > 5_000_000)
    throw new Error("Spec supérieure à 5 Mo.");
  const result = await quizVideo(
    JSON.parse(await readFile(positionals[0], "utf8")),
    {
      ...values,
      jobs: values.jobs ? Number(values.jobs) : undefined,
      assetsDir: values["assets-dir"],
      coverAt:
        values["cover-at"] === undefined
          ? undefined
          : Number(values["cover-at"]),
    },
    (frame, total) => {
      if (frame === total || frame % 300 === 0)
        console.error(`${frame}/${total}`);
    },
  );
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
