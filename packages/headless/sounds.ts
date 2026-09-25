import path from "node:path";
import { realpath, stat } from "node:fs/promises";
import { validRelativePath } from "../core/assets";
import { audioDuration, mediaInfo, soundAmplitudes } from "./audio";

const extensions = new Set([".mp3", ".ogg", ".opus", ".wav", ".flac"]);

/** Confine every sound to assetsDir, including through symlinks. */
export async function resolveSoundFile(
  source: string,
  assetsDir: string | undefined,
  aliases?: Record<string, string>,
) {
  const ref = source.startsWith("asset:") ? aliases?.[source.slice(6)] : source;
  if (!ref?.startsWith("file:"))
    throw new Error(
      `Son ${source}: asset: doit pointer vers audioAssets[id] = "file:...".`,
    );
  if (!assetsDir) throw new Error("Un son file: nécessite --assets-dir.");
  const relative = ref.slice(5);
  if (
    !validRelativePath(relative) ||
    !extensions.has(path.extname(relative).toLowerCase())
  )
    throw new Error(`Chemin ou format audio invalide : ${source}`);
  const root = await realpath(assetsDir),
    file = await realpath(path.join(root, relative));
  const relation = path.relative(root, file);
  if (relation.startsWith("..") || path.isAbsolute(relation))
    throw new Error(`Son hors du dossier autorisé : ${source}`);
  if ((await stat(file)).size > 30_000_000)
    throw new Error(`Son supérieur à 30 Mo : ${source}`);
  const info = await mediaInfo(file);
  if (
    info.streams.filter((stream) => stream.codec_type === "audio").length !==
      1 ||
    info.streams.some((stream) => stream.codec_type === "video")
  )
    throw new Error(`Un seul flux audio, sans vidéo, est requis : ${source}`);
  const duration = await audioDuration(file);
  if (duration > 120)
    throw new Error(`Son supérieur à 120 secondes : ${source}`);
  return { file, duration };
}

export async function inspectQuestionSounds(
  input: {
    levels: {
      questions: { audio?: string; audioStart: number; listen?: number }[];
    }[];
    timing: { listen: number };
    audioAssets?: Record<string, string>;
  },
  assetsDir?: string,
) {
  const clips = new Map<
    string,
    { file: string; duration: number; amplitudes: number[] }
  >();
  let index = 0;
  for (const question of input.levels.flatMap((level) => level.questions)) {
    const id = `question_${++index}`;
    if (!question.audio) continue;
    const source = await resolveSoundFile(
      question.audio,
      assetsDir,
      input.audioAssets,
    );
    if (question.audioStart >= source.duration)
      throw new Error(`${id}: audioStart après la fin du son.`);
    const duration = Math.min(
      question.listen ?? input.timing.listen,
      source.duration - question.audioStart,
    );
    clips.set(id, {
      ...source,
      amplitudes: await soundAmplitudes(
        source.file,
        question.audioStart,
        duration,
      ),
    });
  }
  return clips;
}
