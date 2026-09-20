import fs from "node:fs";
import opentype from "opentype.js";
const metrics = {};
const data = {};
for (const name of [
  "DejaVuSans",
  "DejaVuSans-Bold",
  "DejaVuSansMono",
  "DejaVuSansMono-Bold",
]) {
  const bytes = fs.readFileSync(
    `node_modules/dejavu-fonts-ttf/ttf/${name}.ttf`,
  );
  fs.writeFileSync(`assets/fonts/${name}.ttf`, bytes);
  const font = opentype.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const advances = {};
  for (const [code, index] of Object.entries(font.tables.cmap.glyphIndexMap))
    advances[code] = font.glyphs.get(index).advanceWidth / font.unitsPerEm;
  metrics[name] = {
    advances,
    missing: font.glyphs.get(0).advanceWidth / font.unitsPerEm,
  };
  data[name] = bytes.toString("base64");
}
fs.copyFileSync(
  "node_modules/dejavu-fonts-ttf/LICENSE",
  "assets/fonts/LICENSE",
);
fs.writeFileSync("assets/fonts/metrics.json", JSON.stringify(metrics));
fs.writeFileSync("assets/fonts/data.json", JSON.stringify(data));
