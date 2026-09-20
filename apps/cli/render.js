import { register } from "tsx/esm/api";
register();
const { parseArgs } = await import("node:util");
const { writeFile } = await import("node:fs/promises");
const { readProject, renderVideo } =
  await import("../../packages/headless/video.ts");
const { projectTimeline } = await import("../../packages/core/timeline.ts");
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      fps: { type: "string" },
      format: { type: "string" },
      jobs: { type: "string" },
      crop: { type: "string" },
      scale: { type: "string" },
      "emit-timeline": { type: "string" },
      overwrite: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "node apps/cli/render.js project.json --out video.mp4 [--fps 30 --format mp4|webm --jobs 4 --crop x,y,w,h --scale 1080x1350 --emit-timeline timeline.json --overwrite]",
    );
  } else {
    if (positionals.length !== 1 || !values.out)
      throw new Error("Un projet et --out sont requis. Voir --help.");
    const project = await readProject(positionals[0]);
    const result = await renderVideo(
      project,
      {
        out: values.out,
        fps: values.fps ? Number(values.fps) : undefined,
        format:
          values.format ?? (values.out.endsWith(".webm") ? "webm" : "mp4"),
        jobs: values.jobs ? Number(values.jobs) : 1,
        crop: values.crop?.split(",").map(Number),
        scale: values.scale?.split("x").map(Number),
        overwrite: values.overwrite,
      },
      (frame, total) => {
        if (frame === total || frame % 30 === 0)
          process.stderr.write(`\r${frame}/${total}`);
      },
    );
    if (values["emit-timeline"])
      await writeFile(
        values["emit-timeline"],
        JSON.stringify(projectTimeline(project), null, 2),
        { flag: values.overwrite ? "w" : "wx" },
      );
    console.log("\n" + JSON.stringify(result));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
