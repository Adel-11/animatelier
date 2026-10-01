import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Original synthetic backdrops for the self-contained stack example.
const directory = path.dirname(fileURLToPath(import.meta.url));
const colors = [
  ["#244b74", "#c67261", "#e7b58a"],
  ["#153d50", "#45a78c", "#e8cf9d"],
  ["#393054", "#9c578f", "#e7a582"],
  ["#334846", "#8c9e65", "#ecc68a"],
];
for (let i = 0; i < colors.length; i++) {
  const [top, middle, light] = colors[i];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${top}"/><stop offset=".7" stop-color="${middle}"/><stop offset="1" stop-color="#172338"/></linearGradient></defs><rect width="360" height="640" fill="url(#g)"/><circle cx="${65 + i * 65}" cy="190" r="85" fill="${light}" opacity=".65"/><path d="M0 380 Q90 ${345 + i * 12} 180 390 T360 370 V640 H0" fill="#142434" opacity=".55"/><path d="M0 480 Q160 420 360 510 V640 H0" fill="${light}" opacity=".23"/></svg>`;
  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(directory, `../examples/quiz-stack-bg-${i + 1}.png`));
}
