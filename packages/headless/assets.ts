import sharp from "sharp";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  assetSchema,
  imageDimensions,
  imageMime,
  digest,
  encodeBase64,
  decodeBase64,
  MAX_IMAGE_BYTES,
  validRelativePath,
  type ImageAsset,
} from "../core/assets";
import { parseProject, type Project } from "../core/schema";
import { flattenElements } from "../core/elements";
export async function decodeImage(bytes: Uint8Array): Promise<ImageAsset> {
  if (bytes.byteLength > MAX_IMAGE_BYTES)
    throw new Error("Image supérieure à 5 Mo.");
  imageDimensions(bytes);
  const mime = imageMime(bytes),
    decoder = sharp(bytes, {
      limitInputPixels: 4096 * 4096,
      failOn: "warning",
    });
  const metadata = await decoder.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > 4096 ||
    metadata.height > 4096 ||
    (metadata.pages ?? 1) > 1
  )
    throw new Error("Image fixe de 4096×4096 maximum requise.");
  // Full decode is intentional: metadata alone does not detect truncated image streams.
  const { data, info } = await decoder
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width,
    height = info.height,
    sw = Math.min(width, 64),
    sh = Math.min(height, 64),
    sample = new Uint8Array(sw * sh * 4);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const pos =
        (Math.min(height - 1, Math.floor(((y + 0.5) * height) / sh)) * width +
          Math.min(width - 1, Math.floor(((x + 0.5) * width) / sw))) *
        4;
      sample.set(data.subarray(pos, pos + 4), (y * sw + x) * 4);
    }
  return assetSchema.parse({
    mime,
    sha256: digest(bytes),
    data: encodeBase64(bytes),
    width,
    height,
    sample: { width: sw, height: sh, data: encodeBase64(sample) },
  });
}
export async function localAssetFile(directory: string, relative: string) {
  if (!validRelativePath(relative))
    throw new Error("Chemin image relatif invalide.");
  const root = await realpath(directory),
    target = await realpath(path.join(root, relative));
  const relation = path.relative(root, target);
  if (relation.startsWith("..") || path.isAbsolute(relation))
    throw new Error("Image hors du dossier autorisé.");
  if ((await stat(target)).size > MAX_IMAGE_BYTES)
    throw new Error("Image supérieure à 5 Mo.");
  return target;
}
export async function resolveProjectAssets(
  input: unknown,
  assetsDir?: string,
): Promise<Project> {
  const project = parseProject(input),
    assets = { ...project.assets };
  for (const [id, asset] of Object.entries(assets))
    assets[id] = await decodeImage(decodeBase64(asset.data));
  const files = new Map<string, string>();
  for (const scene of project.scenes)
    for (const element of flattenElements(scene.elements)) {
      if (element.type !== "image" || !element.src.startsWith("file:"))
        continue;
      if (!assetsDir)
        throw new Error("Une image file: nécessite --assets-dir.");
      const relative = element.src.slice(5);
      let id = files.get(relative);
      if (!id) {
        const image = await decodeImage(
          await readFile(await localAssetFile(assetsDir, relative)),
        );
        id = `image_${image.sha256}`;
        assets[id] = image;
        files.set(relative, id);
      }
      element.src = `asset:${id}`;
    }
  if (Object.keys(assets).length) project.assets = assets;
  return parseProject(project);
}
