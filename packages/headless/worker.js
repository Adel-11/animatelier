import { register } from "tsx/esm/api";
register();
const { parentPort, workerData } = await import("node:worker_threads");
const { createFrameRasterizer } = await import("./frame.ts");
const rasterizer = createFrameRasterizer(workerData);
parentPort.on("message", ({ frame, fps }) => {
  try {
    const pixels = rasterizer.render(frame / fps);
    parentPort.postMessage({ pixels });
  } catch (error) {
    parentPort.postMessage({ error: String(error) });
  }
});
