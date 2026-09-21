import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { readFile, writeFile, mkdir, lstat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { assetId, MAX_IMAGE_BYTES, digest } from "../core/assets";
import { decodeImage } from "./assets";
export const downloadManifest = z
  .array(z.object({ id: assetId, url: z.string().url().max(2000) }).strict())
  .min(1)
  .max(100)
  .refine(
    (items) => new Set(items.map((i) => i.id)).size === items.length,
    "IDs dupliqués.",
  );
export function publicImageUrl(input: string): URL {
  let url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "URL HTTPS publique sans identifiants, port 443 uniquement.",
    );
  if (url.hostname === "drive.google.com") {
    const id =
      url.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1] ??
      url.searchParams.get("id");
    if (!id || !/^[\w-]+$/.test(id))
      throw new Error("Lien Drive public invalide.");
    url = new URL(
      `https://drive.usercontent.google.com/download?id=${id}&export=download`,
    );
  }
  return url;
}
export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0)
    );
  }
  // Only globally routable IPv6; reject mapped IPv4, loopback, local and multicast.
  if (isIP(address) === 6)
    return /^[23][0-9a-f]{0,3}:/i.test(address) && !/^2001:db8:/i.test(address);
  return false;
}
export async function downloadPublicImage(
  input: string,
  redirects = 0,
): Promise<Uint8Array> {
  if (redirects > 5) throw new Error("Trop de redirections.");
  const url = publicImageUrl(input),
    host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Adresse privée ou réservée interdite.");
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    // Pin the validated DNS result for this request, while preserving TLS hostname verification.
    const request = https.get(
      url,
      {
        lookup: ((_hostname: any, _options: any, callback: any) =>
          _options.all
            ? callback(null, [selected])
            : callback(null, selected.address, selected.family)) as any,
        headers: {
          "User-Agent": "Animatelier/0.2",
          Accept: "image/png,image/jpeg,image/webp",
        },
        timeout: 15000,
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          downloadPublicImage(
            new URL(response.headers.location, url).href,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Téléchargement HTTP ${response.statusCode}.`));
          return;
        }
        if (Number(response.headers["content-length"]) > MAX_IMAGE_BYTES) {
          response.destroy();
          reject(new Error("Image supérieure à 5 Mo."));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk) => {
          total += chunk.length;
          if (total > MAX_IMAGE_BYTES) {
            response.destroy(new Error("Image supérieure à 5 Mo."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    request.on("timeout", () =>
      request.destroy(new Error("Téléchargement trop long.")),
    );
    request.on("error", reject);
  });
}
export async function fetchAssets(
  input: unknown,
  out: string,
  download = downloadPublicImage,
) {
  const manifest = downloadManifest.parse(input);
  manifest.forEach((item) => publicImageUrl(item.url));
  await mkdir(out, { recursive: true });
  const lockPath = path.join(out, "manifest.lock.json");
  try {
    if ((await lstat(lockPath)).isSymbolicLink())
      throw new Error("Lien symbolique interdit.");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    if (!Array.isArray(lock) || lock.length !== manifest.length)
      throw new Error("Cache existant différent ; choisir un nouveau dossier.");
    for (const item of manifest) {
      const cached = lock.find(
        (entry: any) => entry.id === item.id && entry.url === item.url,
      );
      if (
        !cached ||
        !new RegExp(`^${item.id}\\.(png|jpg|webp)$`).test(cached.file)
      )
        throw new Error("Cache incompatible.");
      const file = path.join(out, cached.file);
      if ((await lstat(file)).isSymbolicLink())
        throw new Error("Lien symbolique interdit.");
      const image = await decodeImage(await readFile(file));
      if (image.sha256 !== cached.sha256)
        throw new Error("Image du cache modifiée.");
    }
    return lock;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const result = [];
  for (const item of manifest) {
    const bytes = await download(item.url),
      image = await decodeImage(bytes);
    const extension = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    }[image.mime];
    const file = `${item.id}.${extension}`;
    await writeFile(path.join(out, file), bytes, { flag: "wx" });
    result.push({
      ...item,
      file,
      mime: image.mime,
      sha256: digest(bytes),
      width: image.width,
      height: image.height,
    });
  }
  await writeFile(lockPath, JSON.stringify(result, null, 2), { flag: "wx" });
  return result;
}
