import { it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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
    const changed = unpack(
      await client.callTool({
        name: "project_apply",
        arguments: {
          expectedRevision: initial.revision,
          commands: [{ type: "project.rename", name: "Projet agent" }],
        },
      }),
    );
    expect(changed.project.name).toBe("Projet agent");
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
  } finally {
    await client.close();
  }
}, 30_000);
