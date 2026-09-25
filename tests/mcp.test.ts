import { rasterFrame } from "../packages/headless/frame";
import { parseProject } from "../packages/core/schema";
import motionExample from "../examples/personnage-et-objet.animatelier.json";
import { it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { newElement } from "../packages/core/elements";

it("un client MCP crée, inspecte en PNG, sauvegarde et recharge un projet", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "animatelier-test-"));
  const client = new Client({ name: "integration-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.resolve("node_modules/tsx/dist/cli.mjs"),
      path.resolve("apps/mcp/server.ts"),
    ],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      ANIMATELIER_PROJECTS_DIR: directory,
    },
  });
  const unpack = (result: any) => JSON.parse(result.content[0].text);
  try {
    await client.connect(transport);
    expect((await client.listTools()).tools.map((t) => t.name)).toContain(
      "render_frame",
    );
    const initial = unpack(
      await client.callTool({ name: "project_get", arguments: {} }),
    );
    const capabilities = unpack(
      await client.callTool({ name: "capabilities", arguments: {} }),
    );
    expect(capabilities.schema.project.definitions.Project).toBeDefined();
    const invalid = unpack(
      await client.callTool({
        name: "project_validate",
        arguments: { project: {} },
      }),
    );
    expect(invalid.ok).toBe(false);
    expect(
      unpack(await client.callTool({ name: "project_get", arguments: {} })),
    ).toEqual(initial);
    const state = unpack(
      await client.callTool({
        name: "project_state_at",
        arguments: { time: 2 },
      }),
    );
    expect(state.revision).toBe(initial.revision);
    expect(state.scene.id).toBe(initial.project.scenes[0].id);
    expect(state.actors[0].visible).toBe(true);
    const changed = unpack(
      await client.callTool({
        name: "project_apply",
        arguments: {
          expectedRevision: initial.revision,
          commands: [
            { type: "project.rename", name: "Projet agent" },
            {
              type: "element.add",
              sceneId: initial.project.scenes[0].id,
              element: newElement("path", 8, {
                id: "trace_agent",
                d: "M0 0 L100 0",
                keyframes: {
                  draw: [
                    { t: 0, v: 0 },
                    { t: 4, v: 1 },
                  ],
                },
              }),
            },
            {
              type: "element.add",
              sceneId: initial.project.scenes[0].id,
              element: newElement("group", 8, {
                id: "groupe_agent",
                children: [
                  newElement("rect", 8, {
                    id: "pivot_agent",
                    keyframes: {
                      rotation: [
                        { t: 0, v: 0 },
                        { t: 4, v: -70, ease: "easeInOut" },
                      ],
                    },
                  }),
                ],
              }),
            },
          ],
        },
      }),
    );
    expect(changed.project.name).toBe("Projet agent");
    const posed = unpack(
      await client.callTool({
        name: "project_state_at",
        arguments: { time: 2 },
      }),
    );
    expect(
      posed.elements.find((e: any) => e.element.id === "groupe_agent")
        .children[0].element.rotation,
    ).toBe(-35);
    expect(
      posed.elements.find((e: any) => e.element.id === "trace_agent")
        .drawnLength,
    ).toBe(50);
    const conflict = await client.callTool({
      name: "project_apply",
      arguments: {
        expectedRevision: initial.revision,
        commands: [{ type: "project.rename", name: "Écrasement" }],
      },
    });
    expect(conflict.isError).toBe(true);
    const rendered: any = await client.callTool({
      name: "render_frame",
      arguments: { time: 1.5 },
    });
    expect(rendered.isError).not.toBe(true);
    expect(rendered.content[1].mimeType).toBe("image/png");
    expect(
      Buffer.from(rendered.content[1].data, "base64").subarray(1, 4).toString(),
    ).toBe("PNG");
    const saved = await client.callTool({
      name: "project_save",
      arguments: { filename: "test.json" },
    });
    expect(saved.isError).not.toBe(true);
    expect(
      JSON.parse(await readFile(path.join(directory, "test.json"), "utf8"))
        .name,
    ).toBe("Projet agent");
    expect(
      (
        await client.callTool({
          name: "project_save",
          arguments: { filename: "test.json" },
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await client.callTool({
          name: "project_save",
          arguments: { filename: "../escape.json" },
        })
      ).isError,
    ).toBe(true);
    const opened = unpack(
      await client.callTool({
        name: "project_open",
        arguments: {
          filename: "test.json",
          expectedRevision: changed.revision,
        },
      }),
    );
    expect(opened.project.name).toBe("Projet agent");
    const compiled = unpack(
      await client.callTool({
        name: "quiz_compile",
        arguments: { spec: capabilities.schema.quiz.examples.list },
      }),
    );
    expect(compiled.schedule[0].reveal).toBe(3);
    const stack = unpack(
      await client.callTool({
        name: "quiz_compile",
        arguments: { spec: capabilities.schema.quiz.examples.stack },
      }),
    );
    expect(stack.project.scenes).toHaveLength(6);
    expect(stack.project.width).toBe(1080);
    expect(
      unpack(await client.callTool({ name: "project_get", arguments: {} })),
    ).toEqual(opened);
    const quiz = unpack(
      await client.callTool({
        name: "project_load_data",
        arguments: {
          expectedRevision: opened.revision,
          project: compiled.project,
        },
      }),
    );
    expect(quiz.project.scenes).toHaveLength(10);
    const revealed = unpack(
      await client.callTool({
        name: "project_state_at",
        arguments: { time: 3 },
      }),
    );
    expect(
      revealed.elements.find((e: any) => e.element.id === "list_answer_1"),
    ).toMatchObject({ visible: true, displayText: "Paris" });
    const quizPng: any = await client.callTool({
      name: "render_frame",
      arguments: { time: 3 },
    });
    expect(quizPng.content[1].mimeType).toBe("image/png");
    for (const time of [0, 1.5, 3]) {
      const frame: any = await client.callTool({
        name: "render_frame",
        arguments: { time },
      });
      expect(
        Buffer.from(frame.content[1].data, "base64").equals(
          rasterFrame(parseProject(quiz.project), time).asPng(),
        ),
      ).toBe(true);
    }
    const small = {
      ...quiz.project,
      width: 320,
      height: 180,
      scenes: [{ ...quiz.project.scenes[0], duration: 1, elements: [] }],
    };
    const launched = unpack(
      await client.callTool({
        name: "project_render_video",
        arguments: { project: small, out: "render.mp4", fps: 2, jobs: 2 },
      }),
    );
    expect(launched.jobId).toBeDefined();
    let status;
    for (let i = 0; i < 100; i++) {
      status = unpack(
        await client.callTool({
          name: "render_status",
          arguments: { jobId: launched.jobId },
        }),
      );
      if (status.status !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(status).toMatchObject({
      status: "completed",
      frame: 2,
      result: { frames: 2 },
    });
    expect(
      (await readFile(path.join(directory, "render.mp4"))).length,
    ).toBeGreaterThan(100);
    const escaped = await client.callTool({
      name: "project_render_video",
      arguments: { out: "../escape.mp4" },
    });
    expect(escaped.isError).toBe(true);
    expect(
      unpack(await client.callTool({ name: "project_get", arguments: {} })),
    ).toEqual(quiz);
    expect(capabilities.schema.motion.guide).toContain("timeline");
    await client.callTool({
      name: "project_load_data",
      arguments: { expectedRevision: quiz.revision, project: motionExample },
    });
    const motion = unpack(
      await client.callTool({
        name: "project_state_at",
        arguments: { time: 3 },
      }),
    );
    expect(motion.actors[0]).toMatchObject({
      action: "hold",
      dialogue: "Voici mon idée !",
      x: 620,
    });
    expect(motion.actors[0].hands.right).toHaveLength(6);
    expect(motion.elements[0].worldTransform[4]).toBeCloseTo(
      motion.actors[0].hands.right[4],
    );
    const motionPng: any = await client.callTool({
      name: "render_frame",
      arguments: { time: 3 },
    });
    expect(motionPng.content[1].mimeType).toBe("image/png");
  } finally {
    await client.close();
  }
}, 30_000);
