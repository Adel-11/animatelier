// Écrit le script vocal (id, texte) d'une spec levels, sans rendu.
// Usage : node voice_script.mjs spec.json voice-script.json   (lancer depuis le dépôt animatelier)
import { register } from "tsx/esm/api";
register();
const fs = await import("node:fs");
const path = await import("node:path");
const root = process.cwd();
const { compileQuiz } = await import(path.join(root, "packages/core/quiz.ts"));
const { normalizeLevels } = await import(path.join(root, "packages/core/levels.ts"));
const spec = normalizeLevels(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));
const { voiceScript } = compileQuiz(spec, undefined, { voiceDurations: {} });
fs.writeFileSync(process.argv[3], JSON.stringify(voiceScript.map(({ id, text }) => ({ id, text })), null, 1));
console.log(voiceScript.length, "slots");
