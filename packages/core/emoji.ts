// Emojis en couleur : resvg ne rend pas les polices emoji couleur (CBDT/COLR),
// on les remplace donc par des images PNG Noto Emoji (Apache 2.0), résolues
// côté headless sous `file:emoji/emoji_u<codes>.png` (voir packages/headless/assets.ts).
const pictographic = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** Découpe un texte composé uniquement d'emojis (espaces tolérés) ; sinon undefined. */
export function emojiOnly(text: string): string[] | undefined {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const tokens: string[] = [];
  for (const { segment } of segmenter.segment(text.trim())) {
    if (/^\s+$/.test(segment)) continue;
    if (!pictographic.test(segment)) return undefined;
    tokens.push(segment);
  }
  return tokens.length && tokens.length <= 8 ? tokens : undefined;
}

/** Nom de fichier Noto Emoji : code points en hexadécimal, sans sélecteur de variante FE0F. */
export function emojiFile(token: string) {
  const codes = Array.from(token)
    .map((c) => c.codePointAt(0)!)
    .filter((code) => code !== 0xfe0f)
    .map((code) => code.toString(16));
  return `emoji/emoji_u${codes.join("_")}.png`;
}

export const EMOJI_FILE = /^emoji\/emoji_u[0-9a-f]{2,6}(_[0-9a-f]{2,6}){0,9}\.png$/;

/** Images d'une rangée d'emojis centrée sur (cx, cy). */
export function emojiRow(
  id: string,
  tokens: string[],
  cx: number,
  cy: number,
  maxWidth: number,
  maxSize: number,
  extra: Record<string, unknown> = {},
) {
  const gap = 0.12;
  const size = Math.min(maxSize, maxWidth / (tokens.length + gap * (tokens.length - 1)));
  const total = size * (tokens.length + gap * (tokens.length - 1));
  return tokens.map((token, i) => ({
    id: `${id}_emoji_${i + 1}`,
    type: "image" as const,
    src: `file:${emojiFile(token)}`,
    x: cx - total / 2 + i * size * (1 + gap),
    y: cy - size / 2,
    w: size,
    h: size,
    fit: "contain",
    ...extra,
  }));
}
