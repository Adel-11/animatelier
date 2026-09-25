import { expect, test } from "@playwright/test";

test("crée une liste depuis l’application, vérifie son calendrier et retrouve l’aide sur mobile", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/quiz-create-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Vérifier le script" }).click();
  await expect(
    page.getByRole("dialog", { name: "Créer un quiz" }).getByRole("status"),
  ).toContainText("10 questions · 50 secondes");
  await page
    .getByRole("button", { name: "Créer le quiz", exact: true })
    .click();
  await page.evaluate(() => window.animatelier.seek(0.5));
  await page.screenshot({
    path: "test-results/quiz-list-empty.png",
    fullPage: true,
  });
  const report = await page.evaluate(() => {
    const api = window.animatelier;
    const original = api.getProject();
    let rejected = false;
    try {
      api.loadQuiz({ mode: "list" });
    } catch {
      rejected = true;
    }
    const unchanged =
      JSON.stringify(original) === JSON.stringify(api.getProject());
    const state = api.getStateAt(48);
    api.seek(48);
    return {
      rejected,
      unchanged,
      answers: state.elements.filter(
        (e) => e.element.id.startsWith("list_answer_") && e.visible,
      ).length,
    };
  });
  expect(report).toEqual({ rejected: true, unchanged: true, answers: 10 });
  await page.screenshot({
    path: "test-results/quiz-list-filled.png",
    fullPage: true,
  });
  await page.reload();
  await page.waitForFunction(() => !!window.animatelier);
  expect(
    await page.evaluate(() => window.animatelier.getProject().scenes.length),
  ).toBe(10);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Agents/ }).click();
  await page
    .getByText("Guide quiz : API, timing et export", { exact: true })
    .click();
  await expect(
    page
      .locator(".quiz-guide")
      .filter({ hasText: "Guide quiz : API, timing et export" }),
  ).toContainText("compileQuiz(spec)");
  await page.screenshot({
    path: "test-results/quiz-help-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("un agent découvre le QCM, le charge avec un nouvel ID et exporte une vidéo décodable", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.animatelier);
  const result = await page.evaluate(async () => {
    const api = window.animatelier;
    const spec = {
      ...api.help().quiz.examples.choices,
      revealDelay: 0.5,
      answerDuration: 0.5,
    };
    const before = api.getProject();
    const compiled = api.compileQuiz(spec);
    const pure = JSON.stringify(api.getProject()) === JSON.stringify(before);
    const first = api.loadQuiz(spec);
    const second = api.loadQuiz(spec);
    api.seek(0.75);
    const answer = api
      .getStateAt(0.5)
      .elements.find((e) => e.element.id === "correct_2");
    const output = await api.exportVideo();
    const video = document.createElement("video");
    const dimensions = await new Promise<number[]>((resolve, reject) => {
      video.onloadeddata = () => resolve([video.videoWidth, video.videoHeight]);
      video.onerror = () => reject(new Error("Quiz WebM illisible"));
      video.src = output.url;
    });
    video.removeAttribute("src");
    video.load();
    api.releaseExport(output.url);
    api.seek(0.75);
    return {
      pure,
      newId: first.project.id !== second.project.id,
      duration: compiled.duration,
      answerVisible: answer?.visible,
      size: output.size,
      dimensions,
    };
  });
  expect(result).toMatchObject({
    pure: true,
    newId: true,
    duration: 1,
    answerVisible: true,
    dimensions: [1280, 720],
  });
  expect(result.size).toBeGreaterThan(1000);
  await page.screenshot({
    path: "test-results/quiz-choices.png",
    fullPage: true,
  });
});

test("les presets créatifs chargent un jeu télévisé et un présentateur animé", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Jeu télévisé" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Personnage présentateur" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Jeu télévisé" }).click();
  await page
    .getByRole("button", { name: "Créer le quiz", exact: true })
    .click();
  const game = await page.evaluate(() => {
    const project = window.animatelier.getProject();
    window.animatelier.seek(1);
    return {
      scenes: project.scenes.length,
      ladder: project.scenes[0].elements.some((e) => e.id === "ladder_1"),
      backdrop: project.scenes[0].backdrop?.type,
    };
  });
  expect(game).toEqual({ scenes: 3, ladder: true, backdrop: "linear" });
  await page.screenshot({
    path: "test-results/quiz-game-show.png",
    fullPage: true,
  });

  const presenter = await page.evaluate(() => {
    const api = window.animatelier;
    api.loadQuiz(api.help().quiz.examples.presenter);
    api.seek(1);
    const project = api.getProject();
    return project.scenes[0].actors[0]?.name;
  });
  expect(presenter).toBe("Camille");
  await page.screenshot({
    path: "test-results/quiz-presenter.png",
    fullPage: true,
  });
});

test("un agent charge une liste verticale cumulative et inspecte son rendu", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.animatelier);
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Liste verticale animée" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Liste verticale animée" }).click();
  await page
    .getByRole("button", { name: "Créer le quiz", exact: true })
    .click();
  const result = await page.evaluate(() => {
    const api = window.animatelier;
    const built = api.loadQuiz({
      mode: "stack",
      title: "DEVINE",
      theme: "default",
      items: ["Lion", "Chat", "Loup", "Hibou", "Baleine"].map((a) => ({ a })),
    });
    const fourth = built.project.scenes[3];
    const before = built.schedule[3].reveal - 0.1;
    api.seek(before);
    const hidden = api
      .getStateAt(before)
      .elements.find((entry) => entry.element.id === "row_answer_4")?.visible;
    api.seek(built.schedule[3].reveal + 0.5);
    const visible = api
      .getStateAt(built.schedule[3].reveal + 0.5)
      .elements.find((entry) => entry.element.id === "row_answer_4")?.visible;
    return {
      width: built.project.width,
      height: built.project.height,
      scenes: built.project.scenes.length,
      rowCount: fourth.elements.filter(
        (entry) =>
          entry.id.startsWith("row_") && !entry.id.startsWith("row_number"),
      ).length,
      hidden,
      visible,
    };
  });
  expect(result).toEqual({
    width: 1080,
    height: 1920,
    scenes: 6,
    rowCount: 9,
    hidden: false,
    visible: true,
  });
  await page.screenshot({
    path: "test-results/quiz-stack.png",
    fullPage: true,
  });
});
