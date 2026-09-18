import { test, expect } from "@playwright/test";
test("créer, animer, annuler et rouvrir un projet", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".project-title")).toContainText(
    "Une idée prend vie",
  );
  await page.screenshot({
    path: "test-results/studio-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Ajouter Sasha", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Nom", exact: true }),
  ).toHaveValue("Sasha");
  await page
    .getByRole("combobox", { name: "Animation", exact: true })
    .selectOption("walk");
  await page.getByLabel("Déplacement horizontal (px)").fill("200");
  await page.getByLabel("Déplacement horizontal (px)").press("Enter");
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const p = await page.evaluate(() => window.animatelier.getProject());
  expect(p.scenes[0].actors).toHaveLength(3);
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  expect(
    (await page.evaluate(() => window.animatelier.getProject())).scenes[0]
      .actors,
  ).toHaveLength(2);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(
    (await page.evaluate(() => window.animatelier.getProject())).scenes[0]
      .actors,
  ).toHaveLength(3);
  await page.reload();
  expect(
    (await page.evaluate(() => window.animatelier.getProject())).scenes[0]
      .actors,
  ).toHaveLength(3);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sauvegarder", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("projet.animatelier.json");
  expect(errors).toEqual([]);
});
test("mise en page mobile et changement de scène", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Exporter la vidéo ↗" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "＋ Scène", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Nom de la scène", exact: true }),
  ).toHaveValue("Scène 2");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/studio-mobile.png",
    fullPage: true,
  });
});
test("API partagée, rendu PNG, export vidéo et validation", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const p = window.animatelier.getProject();
    const scene = p.scenes[0];
    scene.duration = 1;
    scene.actors.forEach((a) => (a.end = 1));
    window.animatelier.apply([{ type: "scene.replace", scene }]);
    const image = await window.animatelier.renderPng(0.5);
    return { size: image.size, type: image.type };
  });
  expect(result.size).toBeGreaterThan(1000);
  expect(result.type).toBe("image/png");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter la vidéo ↗" }).click();
  expect((await download).suggestedFilename()).toBe("animation.webm");
  await expect(page.getByRole("status")).toContainText("exportée");
});
