import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const demo = JSON.parse(
  readFileSync(
    new URL(
      "../../examples/trace-masque-compteur.animatelier.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("tracé, masque et compteur : pixels PNG, édition et persistance", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate((p) => {
    window.animatelier.load(p);
    window.animatelier.seek(5);
  }, demo);
  await expect(
    page.locator('.stage [data-element-id="compteur"]'),
  ).toContainText("V = 100 mL");
  const pixels = await page.evaluate(async () => {
    const image = await createImageBitmap(
      await window.animatelier.renderPng(5),
    );
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    image.close();
    return {
      outside: [...ctx.getImageData(200, 420, 1, 1).data],
      inside: [...ctx.getImageData(300, 420, 1, 1).data],
    };
  });
  expect(pixels.outside).toEqual([255, 255, 255, 255]);
  expect(pixels.inside).toEqual([92, 174, 232, 255]);
  await page.getByRole("button", { name: /Éléments$/ }).click();
  await page.screenshot({
    path: "test-results/lot2-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Groupe · vase", exact: true })
    .click();
  await page
    .getByLabel("Forme du masque", { exact: true })
    .selectOption("ellipse");
  await page
    .getByRole("button", { name: "Texte · compteur", exact: true })
    .click();
  await page.getByLabel("Compteur to", { exact: true }).fill("400");
  await page.getByLabel("Compteur decimals", { exact: true }).focus();
  await expect(
    page.locator('.stage [data-element-id="compteur"]'),
  ).toContainText("V = 200 mL");
  await page
    .getByRole("button", { name: "Tracé · courbe", exact: true })
    .click();
  await expect(page.getByLabel("Tracé SVG", { exact: true })).toHaveValue(
    demo.scenes[0].elements.find((e: any) => e.id === "courbe").d,
  );
  await page.reload();
  const result = await page.evaluate(() => window.animatelier.getStateAt(5));
  expect(
    result.elements.find((e) => e.element.id === "compteur")?.numberValue,
  ).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.animatelier.seek(5));
  await page.screenshot({
    path: "test-results/lot2-mobile.png",
    fullPage: true,
  });
});
