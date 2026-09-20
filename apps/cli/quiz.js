import { register } from "tsx/esm/api";
register();
const { parseArgs } = await import("node:util");
const { readFile, writeFile, stat } = await import("node:fs/promises");
const { compileQuiz } = await import("../../packages/core/quiz.ts");
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      overwrite: { type: "boolean" },
    },
  });
  if (positionals.length !== 1 || !values.out)
    throw new Error(
      "node apps/cli/quiz.js spec.json -o project.json [--overwrite]",
    );
  if ((await stat(positionals[0])).size > 5_000_000)
    throw new Error("Fichier supérieur à 5 Mo.");
  const result = compileQuiz(
    JSON.parse(await readFile(positionals[0], "utf8")),
  );
  await writeFile(values.out, JSON.stringify(result.project, null, 2), {
    flag: values.overwrite ? "w" : "wx",
  });
  console.log(JSON.stringify({ path: values.out, schedule: result.schedule }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
