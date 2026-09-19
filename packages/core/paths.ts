import { svgPathProperties } from "svg-path-properties";
import { z } from "zod";

const counts: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};
type Metrics = {
  d: string;
  length: number;
  parts: { d: string; length: number }[];
};
const cache = new Map<string, Metrics>();
export function pathMetrics(d: string): Metrics {
  const cached = cache.get(d);
  if (cached) return cached;
  if (!d.length || d.length > 16000)
    throw new Error("Tracé vide ou supérieur à 16 000 caractères.");
  const tokens =
    d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  if (
    d
      .replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, "")
      .replace(/[\s,]/g, "") ||
    !/^m$/i.test(tokens[0] ?? "")
  )
    throw new Error("Syntaxe de tracé invalide : commencer par M.");
  let i = 0,
    command = "",
    segments = 0;
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) command = tokens[i++].toUpperCase();
    if (!Object.hasOwn(counts, command))
      throw new Error("Commande SVG inconnue.");
    const count = counts[command];
    if (++segments > 500) throw new Error("Maximum 500 segments par tracé.");
    if (command === "Z") {
      command = "";
      continue;
    }
    const numbers = tokens.slice(i, i + count).map(Number);
    if (
      numbers.length !== count ||
      numbers.some((n) => !Number.isFinite(n) || Math.abs(n) > 10000)
    )
      throw new Error("Paramètres SVG invalides ou hors des bornes ±10 000.");
    if (
      command === "A" &&
      (numbers[0] < 0 ||
        numbers[1] < 0 ||
        ![0, 1].includes(numbers[3]) ||
        ![0, 1].includes(numbers[4]))
    )
      throw new Error("Rayons ou indicateurs d’arc invalides.");
    i += count;
    if (command === "M") command = "L";
  }
  const normalized = tokens
    .map((token) => (/^[a-zA-Z]$/.test(token) ? token : String(Number(token))))
    .join(" ");
  const properties = new svgPathProperties(normalized);
  const parts = properties.getParts().map((part) => ({
    d: `M${part.start.x} ${part.start.y} ${part.details[0] === "Z" ? `L${part.end.x} ${part.end.y}` : part.details.join(" ")}`,
    length: part.length,
  }));
  const length = properties.getTotalLength();
  if (
    !Number.isFinite(length) ||
    length > 10000000 ||
    parts.some((p) => !Number.isFinite(p.length))
  )
    throw new Error("Longueur de tracé invalide.");
  const result = { d: normalized, length, parts };
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(d, result);
  return result;
}
export const pathDataSchema = z
  .string()
  .min(1)
  .max(16000)
  .superRefine((d, ctx) => {
    try {
      pathMetrics(d);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Tracé invalide.",
      });
    }
  });
