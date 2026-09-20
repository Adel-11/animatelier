import { expect, test } from "@playwright/test";
import { parseProject } from "../../packages/core/schema";
import { renderProjectSvg } from "../../packages/renderer/svg";
import quiz from "../../examples/quiz-list.animatelier.json" with { type: "json" };
test("le canevas portrait, la police et le flou partagent le SVG headless", async ({
  page,
}) => {
  await page.goto("/");
  const project = parseProject({
    ...quiz,
    width: 1080,
    height: 1350,
    scenes: [
      {
        ...quiz.scenes[0],
        elements: [
          {
            id: "text",
            type: "text",
            text: "Été à Montréal — animation",
            fontSize: 70,
            maxWidth: 850,
            x: 100,
            y: 220,
            end: 5,
            keyframes: {
              blur: [
                { t: 0, v: 8 },
                { t: 3, v: 0 },
              ],
            },
          },
          {
            id: "box",
            type: "rect",
            x: 100,
            y: 400,
            w: 800,
            h: 500,
            end: 5,
            fill: "#8777ee",
          },
        ],
      },
    ],
  });
  await page.evaluate((p) => {
    window.animatelier.load(p);
    window.animatelier.seek(1.5);
  }, project);
  await page.evaluate(() => document.fonts.ready);
  const svg = page.locator(".stage > svg");
  await expect(svg).toHaveAttribute("width", "1080");
  await expect(svg).toHaveAttribute("height", "1350");
  await expect(svg.locator("feGaussianBlur")).toHaveAttribute(
    "stdDeviation",
    "4",
  );
  for (const time of [0, 1.5, 3]) {
    await page.evaluate((t) => window.animatelier.seek(t), time);
    const expected = renderProjectSvg(project, time);
    expect(
      await svg.evaluate((element, expected) => {
        const parsed = new DOMParser().parseFromString(
          expected,
          "image/svg+xml",
        ).documentElement;
        return element.isEqualNode(parsed);
      }, expected),
    ).toBe(true);
  }
  await page.screenshot({
    path: "test-results/headless-portrait.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/headless-portrait-mobile.png",
    fullPage: true,
  });
});
