import { expect, test } from "@playwright/test";

test("un agent découvre, valide, modifie et sauvegarde sans écraser sa première copie", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(() => {
    const api = window.animatelier;
    const before = api.getProject();
    const invalid = api.validate({ ...before, name: "" });
    const unchanged =
      JSON.stringify(before) === JSON.stringify(api.getProject());
    const loaded = api.load(before);
    const applied = api.apply([
      { type: "project.rename", name: "Film original" },
    ]);
    const saved = api.save();
    const copied = api.saveAs("Film variante");
    api.apply([{ type: "project.rename", name: "Variante modifiée" }]);
    api.save();
    const copies = api.listSaved();
    const original = api.openSaved(saved.id);
    return {
      help: api.help(),
      invalid,
      unchanged,
      loaded,
      applied,
      saved,
      copied,
      copies,
      original,
      state: api.getStateAt(2),
    };
  });
  expect(result.help.apiVersion).toBe(2);
  expect(result.invalid.ok).toBe(false);
  expect(result.unchanged).toBe(true);
  expect(result.loaded).toMatchObject({ ok: true, duration: 8 });
  expect(result.applied.project.name).toBe("Film original");
  expect(result.copied.id).not.toBe(result.saved.id);
  expect(result.copies).toHaveLength(2);
  expect(result.original.project.name).toBe("Film original");
  expect(result.state.actors[0].visible).toBe(true);
  await expect(page.locator(".project-title")).toContainText("Film original");
  await page.reload();
  expect(
    await page.evaluate(() => window.animatelier.listSaved()),
  ).toHaveLength(2);
  await page.getByRole("button", { name: /Agents/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Interface agents" }),
  ).toContainText("api.help()");
  await page.getByText("Référence complète de l’API", { exact: true }).click();
  await page.screenshot({
    path: "test-results/agent-help.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Compris", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Compris", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/agent-help-mobile.png",
    fullPage: true,
  });
});

test("export API : progression, exclusion mutuelle, URL récupérable et annulation", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const api = window.animatelier;
    const project = api.getProject();
    project.scenes[0].duration = 1;
    project.scenes[0].actors.forEach((actor) => (actor.end = 1));
    api.load(project);
    const pending = api.exportVideo();
    const initial = api.getExportState();
    let locked = false;
    try {
      api.apply([{ type: "project.rename", name: "Interdit pendant export" }]);
    } catch {
      locked = true;
    }
    let concurrent = false;
    try {
      await api.exportVideo();
    } catch {
      concurrent = true;
    }
    const exported = await pending;
    const bytes = (await (await fetch(exported.url)).arrayBuffer()).byteLength;
    const video = document.createElement("video");
    const decoded = new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        video.onloadeddata = () =>
          resolve({ width: video.videoWidth, height: video.videoHeight });
        video.onerror = () => reject(new Error("WebM illisible"));
      },
    );
    video.src = exported.url;
    video.load();
    const dimensions = await decoded;
    video.removeAttribute("src");
    video.load();
    const done = api.getExportState();
    api.releaseExport(exported.url);
    const released = api.getExportState();
    const cancelled = api.exportVideo().catch((error) => String(error));
    api.cancelExport();
    await cancelled;
    const final = api.getExportState();
    const after = api.apply([
      { type: "project.rename", name: "Après annulation" },
    ]);
    return {
      initial,
      locked,
      concurrent,
      exported,
      bytes,
      dimensions,
      done,
      released,
      final,
      after,
    };
  });
  expect(result.initial).toMatchObject({ status: "running", progress: 0 });
  expect(result.locked).toBe(true);
  expect(result.concurrent).toBe(true);
  expect(result.exported.mimeType).toContain("video/webm");
  expect(result.bytes).toBeGreaterThan(1000);
  expect(result.dimensions).toEqual({ width: 1280, height: 720 });
  expect(result.done).toMatchObject({ status: "done", progress: 1 });
  expect(result.released.url).toBeUndefined();
  expect(result.final.status).toBe("cancelled");
  expect(result.after.ok).toBe(true);
});

test("échec de sauvegarde sans mutation et inspection de 40 personnages", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const api = window.animatelier;
    const original = api.getProject();
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("Plein", "QuotaExceededError");
    };
    let failed = false;
    try {
      api.saveAs("Sans place");
    } catch {
      failed = true;
    } finally {
      Storage.prototype.setItem = setItem;
    }
    const preserved = api.getProject().id === original.id;
    const actor = original.scenes[0].actors[0];
    original.scenes[0].actors = Array.from({ length: 40 }, (_, i) => ({
      ...actor,
      id: `actor_${i}`,
      x: 100 + i * 25,
    }));
    api.load(original);
    const start = performance.now();
    const state = api.getStateAt(2);
    const inspectionMs = performance.now() - start;
    const pngStart = performance.now();
    const png = await api.renderPng(2);
    return {
      failed,
      preserved,
      actors: state.actors.length,
      inspectionMs,
      pngMs: performance.now() - pngStart,
      size: png.size,
    };
  });
  expect(result.failed).toBe(true);
  expect(result.preserved).toBe(true);
  expect(result.actors).toBe(40);
  expect(result.size).toBeGreaterThan(1000);
  console.log("Mesure locale agents (40 personnages)", result);
});
