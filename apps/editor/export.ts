import { renderProjectSvg } from "../../packages/renderer/svg";
import { totalDuration } from "../../packages/core/engine";
import type { Project } from "../../packages/core/schema";

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function svgImage(
  svg: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await bounded(image.decode(), "Décodage SVG", signal);
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function bounded<T>(
  promise: Promise<T>,
  label: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} : délai dépassé (10 s).`));
    }, 10_000);
    const abort = () => {
      cleanup();
      reject(new Error("Export annulé."));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    signal?.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
    if (signal?.aborted) abort();
  });
}
export async function pngFrame(project: Project, time: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  canvas
    .getContext("2d")!
    .drawImage(await svgImage(renderProjectSvg(project, time)), 0, 0);
  return bounded(
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Échec PNG."))),
        "image/png",
      ),
    ),
    "Encodage PNG",
  );
}
export async function exportVideo(
  project: Project,
  onProgress: (n: number) => void,
  signal: AbortSignal,
) {
  const mimeType = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find(
    (m) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
  );
  if (!mimeType)
    throw new Error(
      "Export WebM indisponible dans ce navigateur. Essayez Chrome ou Edge.",
    );
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  const drawFrame = async (time: number) => {
    ctx.drawImage(
      await svgImage(renderProjectSvg(project, time), signal),
      0,
      0,
    );
  };
  if (signal.aborted) throw new Error("Export annulé.");
  const stream = canvas.captureStream(project.fps);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 5_000_000,
  });
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("Échec de l’encodage vidéo."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });
  // Attach a rejection handler immediately, even while rendering is still in progress.
  void done.catch(() => {});
  const duration = totalDuration(project);
  let started = false;
  recorder.onstart = () => {
    started = true;
  };
  try {
    recorder.start();
    // The first encoder startup can outlast a short film. Feed frames until
    // recording actually begins, then start the project clock.
    const deadline = performance.now() + 10_000;
    while (!started) {
      if (signal.aborted) throw new Error("Export annulé.");
      if (performance.now() > deadline)
        throw new Error("Démarrage vidéo : délai dépassé (10 s).");
      await drawFrame(0);
      track.requestFrame?.();
      await new Promise((resolve) => setTimeout(resolve, 1000 / project.fps));
    }
    const start = performance.now();
    while (true) {
      if (signal.aborted) throw new Error("Export annulé.");
      if (document.hidden)
        throw new Error("Export interrompu : gardez cet onglet visible.");
      const time = Math.min(duration, (performance.now() - start) / 1000);
      await drawFrame(time);
      track.requestFrame?.();
      onProgress(time / duration);
      if (time >= duration) break;
      await new Promise((r) => setTimeout(r, 1000 / project.fps));
    }
    recorder.stop();
    return await bounded(done, "Finalisation vidéo", signal);
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
  }
}
