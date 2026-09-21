import { it, expect } from "vitest";
import sharp from "sharp";
import { mkdtemp, readFile, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assetSchema,
  imageSource,
  digest,
  encodeBase64,
  imageDimensions,
} from "../packages/core/assets";
import { parseProject, demoProject } from "../packages/core/schema";
import { newElement } from "../packages/core/elements";
import { resolveProjectAssets, decodeImage } from "../packages/headless/assets";
import { renderProjectSvg } from "../packages/renderer/svg";
import { rasterFrame } from "../packages/headless/frame";
import {
  fetchAssets,
  publicAddress,
  publicImageUrl,
  downloadPublicImage,
} from "../packages/headless/fetch-assets";
const png = () =>
  sharp({
    create: { width: 64, height: 64, channels: 4, background: "#FF9933" },
  })
    .png()
    .toBuffer();
it("decode les formats réels et rejette type, checksum, dimensions et chemins invalides", async () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    const bytes = await sharp(await png())
      .toFormat(format)
      .toBuffer();
    const asset = await decodeImage(bytes);
    expect(asset.width).toBe(64);
    expect(imageDimensions(bytes)).toEqual({ width: 64, height: 64 });
    expect(() =>
      assetSchema.parse({ ...asset, sha256: "0".repeat(64) }),
    ).toThrow();
    expect(() => assetSchema.parse({ ...asset, mime: "image/gif" })).toThrow();
  }
  await expect(
    decodeImage(new TextEncoder().encode("<svg/>")),
  ).rejects.toThrow();
  const truncated = (await png()).subarray(0, 40);
  await expect(decodeImage(truncated)).rejects.toThrow();
  const bomb = await sharp({
    create: { width: 4097, height: 1, channels: 3, background: "#FFFFFF" },
  })
    .png()
    .toBuffer();
  await expect(decodeImage(bomb)).rejects.toThrow();
  for (const src of [
    "https://x/a.png",
    "file:../secret",
    "file:/tmp/a",
    "file:C:/a",
    "file:a\\b",
    "file:a/../b",
    "asset:../a",
  ])
    expect(() => imageSource.parse(src)).toThrow();
});
it("résout les fichiers sans sortie de dossier et rend pixelate/zoom de façon déterministe", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "anim-assets-"));
  await writeFile(path.join(dir, "logo.png"), await png());
  const p = demoProject();
  p.scenes[0].actors = [];
  p.scenes[0].elements = [
    newElement("image", 8, {
      src: "file:logo.png",
      w: 100,
      h: 100,
      pixelate: 20,
      keyframes: {
        pixelate: [
          { t: 0, v: 20 },
          { t: 3, v: 0, ease: "step" },
        ],
      },
    }),
  ];
  const resolved = await resolveProjectAssets(p, dir);
  expect(resolved.scenes[0].elements[0]).toHaveProperty(
    "src",
    expect.stringMatching(/^asset:/),
  );
  expect(renderProjectSvg(resolved, 1)).toContain('fill="rgb(255,153,51)"');
  expect(renderProjectSvg(resolved, 3)).toContain(
    'href="data:image/png;base64,',
  );
  expect(digest(rasterFrame(resolved, 1).pixels)).toBe(
    digest(rasterFrame(resolved, 1).pixels),
  );
  await expect(resolveProjectAssets(p)).rejects.toThrow("assets-dir");
  const outside = path.join(dir, "..", `external-${Date.now()}.png`);
  await writeFile(outside, await png());
  try {
    await symlink(outside, path.join(dir, "linked.png"));
    p.scenes[0].elements = [newElement("image", 8, { src: "file:linked.png" })];
    await expect(resolveProjectAssets(p, dir)).rejects.toThrow(
      "hors du dossier",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }
  expect(() =>
    parseProject({
      ...p,
      scenes: [
        {
          ...p.scenes[0],
          elements: [newElement("image", 8, { src: "asset:missing" })],
        },
      ],
    }),
  ).toThrow("absente");
});
it("fetch : lien Drive, cache vérifié sans réécriture, refus HTML et réseau privé", async () => {
  expect(
    publicImageUrl("https://drive.google.com/file/d/abc-123/view?usp=sharing")
      .href,
  ).toBe(
    "https://drive.usercontent.google.com/download?id=abc-123&export=download",
  );
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.20.0.1",
    "192.168.1.2",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])
    expect(publicAddress(ip)).toBe(false);
  await expect(downloadPublicImage("https://127.0.0.1/test")).rejects.toThrow(
    "privée",
  );
  expect(() => publicImageUrl("https://user:pass@example.com/a.png")).toThrow();
  const dir = await mkdtemp(path.join(tmpdir(), "anim-fetch-")),
    manifest = [{ id: "q3", url: "https://example.com/image.png" }];
  let calls = 0;
  const first = await fetchAssets(manifest, dir, async () => {
    calls++;
    return png();
  });
  expect(first[0]).toMatchObject({ file: "q3.png", width: 64 });
  expect(
    await fetchAssets(manifest, dir, async () => {
      throw new Error("Offline");
    }),
  ).toEqual(first);
  expect(calls).toBe(1);
  const badDir = await mkdtemp(path.join(tmpdir(), "anim-fetch-bad-"));
  await expect(
    fetchAssets(manifest, badDir, async () =>
      new TextEncoder().encode("<html>login</html>"),
    ),
  ).rejects.toThrow();
  await writeFile(path.join(dir, "q3.png"), Buffer.from("changed"));
  await expect(fetchAssets(manifest, dir)).rejects.toThrow();
});
