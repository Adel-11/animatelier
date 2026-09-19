import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { pathMetrics } from "../packages/core/paths";
import { newElement, elementSchema } from "../packages/core/elements";
import { demoProject } from "../packages/core/schema";
import { getStateAt } from "../packages/core/agent";
import { renderProjectSvg } from "../packages/renderer/svg";

describe("Tracés, masques et nombres", () => {
  it("valide le langage de tracé et borne sa complexité", () => {
    for (const d of [
      '<svg onload="alert(1)">',
      "M0 0 L10",
      "M0 0 X1 2",
      "M0 0 A20 20 0 2 1 10 10",
      "M0 0 L1e99 2",
      "L0 0",
      "M0 0 " + "L1 1 ".repeat(501),
    ])
      expect(() => pathMetrics(d)).toThrow();
    expect(pathMetrics("m0 0 h100 v100 z").length).toBeCloseTo(
      200 + Math.sqrt(20000),
    );
    expect(pathMetrics("M0 0 A50 50 0 0 1 100 0").length).toBeCloseTo(
      Math.PI * 50,
      0,
    );
    expect(
      pathMetrics("M0 0 C0 100 100 100 100 0 S200 -100 200 0").parts,
    ).toHaveLength(2);
    expect(() =>
      elementSchema.parse(newElement("path", 8, { draw: 2 })),
    ).toThrow();
    expect(() =>
      newElement("group", 8, {
        clip: { type: "image", src: "https://example.com" },
      }),
    ).toThrow();
  });
  it("expose le compteur formaté et la longueur progressive sans modifier le texte source", () => {
    const p = demoProject();
    p.scenes[0].elements = [
      newElement("text", 8, {
        text: "V = {n} mL / {n}",
        number: { from: 0, to: 200, decimals: 1 },
        keyframes: {
          progress: [
            { t: 0, v: 0 },
            { t: 8, v: 1 },
          ],
        },
      }),
      newElement("path", 8, {
        d: "M0 0 L100 0 M200 0 L300 0",
        keyframes: {
          draw: [
            { t: 0, v: 0 },
            { t: 8, v: 1 },
          ],
        },
      }),
    ];
    const state = getStateAt(p, 4);
    expect(state.elements[0]).toMatchObject({
      numberValue: 100,
      displayText: "V = 100.0 mL / 100.0",
    });
    expect(state.elements[1]).toMatchObject({
      pathLength: 200,
      drawnLength: 100,
    });
    expect(p.scenes[0].elements[0]).toMatchObject({ text: "V = {n} mL / {n}" });
    expect(renderProjectSvg(p, 4)).toContain("V = 100.0 mL / 100.0");
    expect(getStateAt(p, 8).elements[0].displayText).toContain("200.0");
  });
  it("le PNG serveur découpe le groupe et révèle le contour par longueur", async () => {
    const p = demoProject();
    p.scenes[0].actors = [];
    p.scenes[0].title = "";
    p.scenes[0].elements = [
      newElement("rect", 8, { x: 0, y: 0, w: 1280, h: 720, fill: "#ffffff" }),
      newElement("group", 8, {
        id: "mask",
        x: 100,
        y: 100,
        clip: { type: "rect", w: 100, h: 100 },
        children: [
          newElement("rect", 8, {
            x: -50,
            y: -50,
            w: 200,
            h: 200,
            fill: "#ff0000",
          }),
        ],
      }),
      newElement("path", 8, {
        x: 300,
        y: 100,
        d: "M0 0 L100 0 M200 0 L300 0",
        stroke: "#0000ff",
        strokeWidth: 10,
        draw: 0.75,
      }),
    ];
    const svg = renderProjectSvg(p, 4);
    const { data, info } = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [
      ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 3),
    ];
    expect(pixel(90, 150)).toEqual([255, 255, 255]);
    expect(pixel(150, 150)).toEqual([255, 0, 0]);
    expect(pixel(210, 150)).toEqual([255, 255, 255]);
    expect(pixel(375, 100)).toEqual([0, 0, 255]);
    expect(pixel(525, 100)).toEqual([0, 0, 255]);
    expect(pixel(575, 100)).toEqual([255, 255, 255]);
    expect(renderProjectSvg(p, 4)).toBe(svg);
  });
});
