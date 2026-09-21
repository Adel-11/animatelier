import { register } from "tsx/esm/api";
register();
const { parseArgs } = await import("node:util");
const { readFile, stat } = await import("node:fs/promises");
const { fetchAssets, downloadPublicImage } =
  await import("../../packages/headless/fetch-assets.ts");
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      "user-agent": { type: "string" },
    },
  });
  if (positionals.length !== 1 || !values.out)
    throw new Error(
      'node apps/cli/fetch-assets.js manifest.json --out assets/ [--user-agent "MonOutil/1.0 (+https://exemple.org)"]',
    );
  if ((await stat(positionals[0])).size > 1_000_000)
    throw new Error("Manifeste trop volumineux.");
  console.log(
    JSON.stringify(
      await fetchAssets(
        JSON.parse(await readFile(positionals[0], "utf8")),
        values.out,
        (url) => downloadPublicImage(url, { userAgent: values["user-agent"] }),
      ),
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
