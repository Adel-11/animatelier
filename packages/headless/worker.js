import { register } from "tsx/esm/api";
register();
const { parentPort, workerData } = await import("node:worker_threads");
const { rasterFrame } = await import("./frame.ts");
parentPort.on("message", ({ frame, fps }) => {
  try {
    const pixels = rasterFrame(workerData, frame / fps).pixels;
    parentPort.postMessage({ pixels });
  } catch (error) {
    parentPort.postMessage({ error: String(error) });
  }
});
