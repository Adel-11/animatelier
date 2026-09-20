import metrics from "../../assets/fonts/metrics.json" with { type: "json" };
// Advances from the bundled TTFs. Kerning is disabled in SVG to share exact widths.
export function measureText(
  text: string,
  size: number,
  family = "DejaVu Sans",
  bold = false,
) {
  const name =
    `${family === "DejaVu Sans Mono" ? "DejaVuSansMono" : "DejaVuSans"}${bold ? "-Bold" : ""}` as keyof typeof metrics;
  const font = metrics[name];
  return (
    Array.from(text).reduce(
      (sum, c) =>
        sum +
        ((font.advances as Record<string, number>)[String(c.codePointAt(0))] ??
          font.missing),
      0,
    ) * size
  );
}
export function wrapText(
  text: string,
  size: number,
  width?: number,
  family = "DejaVu Sans",
  bold = false,
): string[] {
  if (!width) return text.split("\n");
  return text.split("\n").flatMap((paragraph) => {
    const result: string[] = [];
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measureText(candidate, size, family, bold) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        result.push(line);
        line = "";
      }
      for (const char of Array.from(word)) {
        if (line && measureText(line + char, size, family, bold) > width) {
          result.push(line);
          line = "";
        }
        line += char;
      }
    }
    result.push(line);
    return result;
  });
}
