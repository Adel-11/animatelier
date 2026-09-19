import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const example = JSON.parse(
  readFileSync(
    new URL(
      "../../examples/personnage-et-objet.animatelier.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("édite la piste, les oscillations et l’attache puis conserve les données", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.evaluate((p) => {
    window.animatelier.load(p);
    window.animatelier.seek(3);
  }, example);
  await page.locator(".track-label").filter({ hasText: "Alex" }).click();
  await expect(
    page.locator(".actor-track").first().locator(".actor-clip"),
  ).toHaveCount(4);
  await page.getByText("Piste d’actions", { exact: true }).click();
  await page
    .getByLabel("Piste d’actions (JSON)")
    .fill(JSON.stringify([{ start: 0, end: 9, action: "hold" }]));
  await page.getByRole("button", { name: "Appliquer piste d’actions" }).click();
  await expect(page.getByRole("alert")).toContainText("Segments triés");
  await page
    .getByLabel("Piste d’actions (JSON)")
    .fill(JSON.stringify(example.scenes[0].actors[0].timeline));
  await page.getByRole("button", { name: "Appliquer piste d’actions" }).click();
  await page.getByText("Oscillations", { exact: true }).click();
  await page
    .getByLabel("Oscillations (JSON)")
    .fill(
      JSON.stringify({ rotation: { amplitude: 3, frequency: 1, phase: 0 } }),
    );
  await page.getByRole("button", { name: "Appliquer oscillations" }).click();
  await page.evaluate(() => window.animatelier.seek(3.25));
  expect(
    await page.evaluate(
      () => window.animatelier.getStateAt(3.25).actors[0].rotation,
    ),
  ).toBeCloseTo(3);
  await page.getByRole("button", { name: /Éléments$/ }).click();
  await page
    .getByRole("button", { name: "Groupe · carte", exact: true })
    .click();
  await page.getByLabel("Main", { exact: true }).selectOption("left");
  expect(
    await page.evaluate(
      () =>
        window.animatelier.getProject().scenes[0].elements[0].attachment?.hand,
    ),
  ).toBe("left");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByLabel("Main", { exact: true })).toHaveValue("right");
  await expect(page.getByLabel("Forme du masque", { exact: true })).toHaveCount(
    1,
  );
  const png = await page.evaluate(
    async () => (await window.animatelier.renderPng(3.25)).size,
  );
  expect(png).toBeGreaterThan(1000);
  await page.screenshot({
    path: "test-results/motion-desktop.png",
    fullPage: true,
  });
  await page.reload();
  const state = await page.evaluate(() => window.animatelier.getStateAt(4.5));
  expect(state.actors[0].action).toBe("point");
  expect(state.elements[0].element.attachment?.hand).toBe("right");
  await page.evaluate(() => window.animatelier.seek(4.5));
  await page.screenshot({
    path: "test-results/motion-point.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Agents/ }).click();
  await page
    .getByText("Guide personnages : pistes, mains et oscillations", {
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText("attachment");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/motion-help-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
