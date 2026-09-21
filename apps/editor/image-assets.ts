import {
  assetSchema,
  imageDimensions,
  decodeBase64,
  encodeBase64,
  digest,
  imageMime,
  MAX_IMAGE_BYTES,
  type ImageAsset,
} from "../../packages/core/assets";
import { parseProject, type Project } from "../../packages/core/schema";
import { flattenElements } from "../../packages/core/elements";
const cache = new Map<string, ImageAsset>();
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("animatelier.assets.v2", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("assets", { keyPath: "sha256" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
export async function initializeAssets() {
  const database = await db();
  const items = await new Promise<ImageAsset[]>((resolve, reject) => {
    const request = database
      .transaction("assets")
      .objectStore("assets")
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  for (const item of items) {
    try {
      cache.set(item.sha256, assetSchema.parse(item));
    } catch {
      /* Keep corrupted entry unavailable. */
    }
  }
}
async function storeAsset(asset: ImageAsset) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("assets", "readwrite");
    tx.objectStore("assets").put(asset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  cache.set(asset.sha256, asset);
}
export async function decodeBrowserImage(
  bytes: Uint8Array,
): Promise<ImageAsset> {
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new Error("Image supérieure à 5 Mo.");
  imageDimensions(bytes);
  const mime = imageMime(bytes),
    hash = digest(bytes),
    existing = cache.get(hash);
  if (existing) return existing;
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const bitmap = await createImageBitmap(blob, { imageOrientation: "none" });
  try {
    const { width, height } = bitmap;
    if (width > 4096 || height > 4096)
      throw new Error("Image de 4096×4096 maximum.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const rgba = ctx.getImageData(0, 0, width, height).data,
      sw = Math.min(width, 64),
      sh = Math.min(height, 64),
      sample = new Uint8Array(sw * sh * 4);
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const p =
          (Math.min(height - 1, Math.floor(((y + 0.5) * height) / sh)) * width +
            Math.min(width - 1, Math.floor(((x + 0.5) * width) / sw))) *
          4;
        sample.set(rgba.subarray(p, p + 4), (y * sw + x) * 4);
      }
    const asset = assetSchema.parse({
      mime,
      sha256: hash,
      data: encodeBase64(bytes),
      width,
      height,
      sample: { width: sw, height: sh, data: encodeBase64(sample) },
    });
    await storeAsset(asset);
    return asset;
  } finally {
    bitmap.close();
  }
}
export async function prepareBrowserProject(input: unknown): Promise<Project> {
  const project = parseProject(input);
  for (const e of project.scenes.flatMap((s) => flattenElements(s.elements)))
    if (e.type === "image" && e.src.startsWith("file:"))
      throw new Error(
        "Résoudre les images file: avec le CLI avant import dans le navigateur.",
      );
  for (const [id, a] of Object.entries(project.assets ?? {}))
    project.assets![id] = await decodeBrowserImage(decodeBase64(a.data));
  return project;
}
export function preparedProject(input: unknown): Project {
  const project = parseProject(input);
  for (const [id, a] of Object.entries(project.assets ?? {})) {
    const known = cache.get(a.sha256);
    if (!known || known.data !== a.data)
      throw new Error(
        "Utiliser await api.loadWithAssets(project) pour décoder et stocker les images.",
      );
    project.assets![id] = known;
  }
  for (const e of project.scenes.flatMap((s) => flattenElements(s.elements)))
    if (e.type === "image" && e.src.startsWith("file:"))
      throw new Error("Image file: à résoudre avec le CLI.");
  return project;
}
export function serializeStoredProject(project: Project): string {
  return JSON.stringify({
    ...project,
    ...(project.assets
      ? {
          assets: Object.fromEntries(
            Object.entries(project.assets).map(([id, a]) => {
              if (!cache.has(a.sha256))
                throw new Error("Image non sauvegardée dans IndexedDB.");
              return [id, { sha256: a.sha256 }];
            }),
          ),
        }
      : {}),
  });
}
export function hydrateStoredProject(input: any): Project {
  const project = { ...input };
  if (project.assets)
    project.assets = Object.fromEntries(
      Object.entries(project.assets).map(([id, value]) => {
        const a = value as ImageAsset;
        return [id, a.data ? a : cache.get(a.sha256)];
      }),
    );
  return preparedProject(project);
}
