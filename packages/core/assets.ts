import { z } from "zod";
import { sha256 } from "@noble/hashes/sha2.js";
export const MAX_IMAGE_BYTES = 5_000_000;
export const MAX_ASSET_BYTES = 30_000_000;
export const MAX_PROJECT_BYTES = 45_000_000;
export const assetId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const imageSource = z
  .string()
  .max(400)
  .refine(
    (value) =>
      /^asset:[a-zA-Z0-9_-]{1,100}$/.test(value) ||
      (value.startsWith("file:") && validRelativePath(value.slice(5))),
    "Source image : asset:id ou file:chemin relatif sans traversée.",
  );
export function validRelativePath(value: string) {
  return (
    value.length > 0 &&
    value
      .split("/")
      .every(
        (part) =>
          /^[a-zA-Z0-9_ .-]+$/.test(part) &&
          part !== "." &&
          part !== ".." &&
          !part.endsWith(".") &&
          !part.endsWith(" "),
      ) &&
    !value.includes(":") &&
    !value.includes("\\")
  );
}
export const decodeBase64 = (data: string) =>
  Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
export const encodeBase64 = (data: Uint8Array) => {
  let text = "";
  for (let i = 0; i < data.length; i += 8192)
    text += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(text);
};
export const digest = (data: Uint8Array) =>
  Array.from(sha256(data), (v) => v.toString(16).padStart(2, "0")).join("");
export function imageMime(bytes: Uint8Array) {
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    String.fromCharCode(...bytes.slice(1, 8)) === "PNG\r\n\x1a\n"
  )
    return "image/png" as const;
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg" as const;
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp" as const;
  throw new Error("PNG, JPEG ou WebP requis.");
}
const base64 = z
  .string()
  .max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
  .regex(/^[A-Za-z0-9+/]*={0,2}$/)
  .refine((data) => data.length % 4 === 0);
const verified = new Map<string, string>();
export const assetSchema = z
  .object({
    mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    data: base64,
    width: z.number().int().min(1).max(4096).optional(),
    height: z.number().int().min(1).max(4096).optional(),
    sample: z
      .object({
        width: z.number().int().min(1).max(64),
        height: z.number().int().min(1).max(64),
        data: z.string().max(22000),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((asset, ctx) => {
    try {
      if (verified.get(asset.mime + asset.sha256) !== asset.data) {
        const bytes = decodeBase64(asset.data);
        imageDimensions(bytes);
        if (
          bytes.length > MAX_IMAGE_BYTES ||
          imageMime(bytes) !== asset.mime ||
          digest(bytes) !== asset.sha256
        )
          throw new Error("Image : type, taille ou SHA-256 invalide.");
        if (verified.size >= 32) verified.delete(verified.keys().next().value!);
        verified.set(asset.mime + asset.sha256, asset.data);
      }
      if (
        asset.sample &&
        decodeBase64(asset.sample.data).length !==
          asset.sample.width * asset.sample.height * 4
      )
        throw new Error("Échantillon image invalide.");
    } catch (error) {
      ctx.addIssue({ code: "custom", message: String(error) });
    }
  });
export type ImageAsset = z.infer<typeof assetSchema>;
export type Assets = Record<string, ImageAsset>;
export const assetsSchema = z
  .record(assetId, assetSchema)
  .superRefine((assets, ctx) => {
    if (
      Object.keys(assets).length > 100 ||
      Object.values(assets).reduce(
        (sum, a) => sum + Math.floor((a.data.length * 3) / 4),
        0,
      ) > MAX_ASSET_BYTES
    )
      ctx.addIssue({
        code: "custom",
        message: "Maximum 100 images et 30 Mo par projet.",
      });
  });
export function imageDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  const mime = imageMime(bytes),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0;
  if (mime === "image/png") {
    if (bytes.length < 33) throw new Error("PNG incomplet.");
    width = view.getUint32(16);
    height = view.getUint32(20);
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset),
        type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (type === "acTL")
        throw new Error("Images animées non prises en charge.");
      offset += 12 + size;
    }
  } else if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 255) continue;
      let marker = bytes[offset++];
      while (marker === 255) marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker >= 208 && marker <= 215) continue;
      const length = view.getUint16(offset);
      if (length < 2) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  } else {
    const type = String.fromCharCode(...bytes.subarray(12, 16));
    if (type === "VP8X" && bytes.length >= 30) {
      if (bytes[20] & 2)
        throw new Error("Images animées non prises en charge.");
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (type === "VP8L" && bytes.length >= 25) {
      const bits = view.getUint32(21, true);
      width = (bits & 16383) + 1;
      height = ((bits >>> 14) & 16383) + 1;
    } else if (type === "VP8 " && bytes.length >= 30) {
      width = view.getUint16(26, true) & 16383;
      height = view.getUint16(28, true) & 16383;
    }
  }
  if (!width || !height || width > 4096 || height > 4096)
    throw new Error("Image fixe de 4096×4096 maximum requise.");
  return { width, height };
}
