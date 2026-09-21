import { expect, test } from "@playwright/test";
import path from "node:path";
test("importe une image en IndexedDB, anime pixelate et conserve la ressource au rechargement", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.locator(
    'input[type=file][accept="image/png,image/jpeg,image/webp"]',
  );
  await input.setInputFiles(path.resolve("brands/qff/logo.png"));
  await expect(
    page.getByText("Image importée et stockée dans IndexedDB."),
  ).toBeVisible();
  const id = await page.evaluate(() => {
    const api = window.animatelier,
      p = api.getProject(),
      scene = p.scenes[0],
      image = scene.elements.find((e) => e.type === "image")!;
    api.apply([
      {
        type: "element.replace",
        sceneId: scene.id,
        element: {
          ...image,
          keyframes: {
            pixelate: [
              { t: 0, v: 50 },
              { t: 3, v: 0, ease: "step" },
            ],
          },
        },
      },
    ]);
    api.seek(1);
    return image.id;
  });
  await expect(page.locator(`[data-element-id="${id}"] image`)).toHaveCount(0);
  await page.screenshot({
    path: "test-results/image-pixelate.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() =>
      localStorage.getItem("animatelier.project.v2")?.includes("base64"),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("animatelier.project.v2")!).assets,
    ),
  ).toEqual(expect.any(Object));
  await page.reload();
  await page.waitForFunction(() => !!window.animatelier);
  await page.evaluate(() => window.animatelier.seek(3));
  await expect(page.locator(`[data-element-id="${id}"] image`)).toHaveCount(1);
  const exported = await page.evaluate(async () => ({
    size: (await window.animatelier.renderPng(3)).size,
    assets: Object.keys(window.animatelier.getProject().assets ?? {}).length,
  }));
  expect(exported.size).toBeGreaterThan(1000);
  expect(exported.assets).toBe(1);
  await page.screenshot({
    path: "test-results/image-revealed.png",
    fullPage: true,
  });
});
