import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const example = JSON.parse(
  readFileSync(
    new URL(
      "../../examples/formes-et-pivots.animatelier.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("créer un rectangle et animer son pivot depuis l’éditeur", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Éléments$/ }).click();
  await page.getByRole("button", { name: "＋ Rectangle", exact: true }).click();
  await page.getByLabel("Pivot y", { exact: true }).fill("100");
  await page.getByLabel("Temps de clé", { exact: true }).fill("0");
  await page.getByLabel("Valeur de clé", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await page.getByLabel("Temps de clé", { exact: true }).fill("4");
  await page.getByLabel("Valeur de clé", { exact: true }).fill("-70");
  await page
    .getByLabel("Interpolation", { exact: true })
    .selectOption("easeInOut");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await page.evaluate(() => window.animatelier.seek(2));
  const state = await page.evaluate(() => window.animatelier.getStateAt(2));
  expect(state.elements[0].element.rotation).toBe(-35);
  expect(state.elements[0].element.anchor.y).toBe(100);
  await expect(
    page.locator(".stage [data-element-id]").first(),
  ).toHaveAttribute(
    "transform",
    `matrix(${state.elements[0].transform.join(" ")})`,
  );
  await page.getByRole("button", { name: "Supprimer l’élément" }).click();
  expect(
    (await page.evaluate(() => window.animatelier.getProject())).scenes[0]
      .elements,
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.reload();
  expect(
    (await page.evaluate(() => window.animatelier.getStateAt(2))).elements[0]
      .element.rotation,
  ).toBe(-35);
});

test("la démo générique se charge, se rend en PNG et reste éditable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate((p) => {
    window.animatelier.load(p);
    window.animatelier.seek(2);
  }, example);
  await expect(page.locator('.stage [data-element-id="carte"]')).toBeVisible();
  const result = await page.evaluate(async () => {
    const api = window.animatelier;
    const result = api.getStateAt(2);
    const png = await api.renderPng(2);
    return {
      rotation: result.elements[0].children[0].element.rotation,
      size: png.size,
      valid: api.validate(api.getProject()).ok,
    };
  });
  expect(result.rotation).toBe(-35);
  expect(result.valid).toBe(true);
  expect(result.size).toBeGreaterThan(1000);
  await page.getByRole("button", { name: /Éléments$/ }).click();
  await page.screenshot({
    path: "test-results/elements-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/elements-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
