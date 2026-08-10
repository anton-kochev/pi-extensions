import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import aegis from "../extensions/index.ts";

type Handler = (event: any, context: any) => unknown;

function createHarness() {
  const commands = new Map<string, { description: string; handler: Handler }>();
  const handlers = new Map<string, Handler>();
  const entries: Array<{ type: string; data: unknown }> = [];
  const api = {
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    registerCommand: (name: string, definition: any) => commands.set(name, definition),
    appendEntry: (type: string, data: unknown) => entries.push({ type, data }),
  };
  aegis(api as never);
  return { commands, handlers, entries };
}

function createContext(cwd: string, branch: any[] = [], hasUI = true) {
  const notifications: Array<{ message: string; level: string }> = [];
  return {
    cwd,
    hasUI,
    sessionManager: { getEntries: () => branch },
    ui: {
      notify: (message: string, level: string) => notifications.push({ message, level }),
      select: async () => "No",
    },
    notifications,
  };
}

async function emit(harness: ReturnType<typeof createHarness>, event: string, payload: object, context: any) {
  return harness.handlers.get(event)?.({ type: event, ...payload }, context);
}

describe("Aegis extension", () => {
  it("registers only the /aegis command", () => {
    const harness = createHarness();

    assert.equal(harness.commands.has("aegis"), true);
    assert.equal(harness.commands.has("command-guard"), false);
    assert.match(harness.commands.get("aegis")?.description ?? "", /Aegis/i);
  });

  it("loads project rules only from .pi/aegis.json", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pithos-aegis-"));
    try {
      mkdirSync(join(cwd, ".pi"));
      writeFileSync(join(cwd, ".pi", "aegis.json"), JSON.stringify({
        paths: [{ name: "protect secret", pattern: "^secret\\.txt$", action: "block" }],
      }));
      writeFileSync(join(cwd, ".pi", "command-guard.json"), JSON.stringify({
        commands: [{ name: "legacy catch-all", pattern: ".*", action: "block" }],
      }));
      const harness = createHarness();
      const context = createContext(cwd);

      await emit(harness, "session_start", {}, context);
      const bashResult = await emit(harness, "tool_call", {
        toolName: "bash",
        input: { command: "printf safe" },
      }, context);
      const writeResult: any = await emit(harness, "tool_call", {
        toolName: "write",
        input: { path: "secret.txt" },
      }, context);
      const status = await harness.commands.get("aegis")!.handler("status", context);

      assert.equal(bashResult, undefined);
      assert.equal(writeResult?.block, true);
      assert.match(writeResult?.reason ?? "", /protect secret/);
      assert.match(String(status), /\.pi[/\\]aegis\.json/);
      assert.doesNotMatch(String(status), /command-guard/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("protects only the Aegis config path with its built-in rule", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pithos-aegis-"));
    try {
      const harness = createHarness();
      const context = createContext(cwd, [], false);
      await emit(harness, "session_start", {}, context);

      const aegisResult: any = await emit(harness, "tool_call", {
        toolName: "edit",
        input: { path: ".pi/aegis.json" },
      }, context);
      const legacyResult = await emit(harness, "tool_call", {
        toolName: "edit",
        input: { path: ".pi/command-guard.json" },
      }, context);

      assert.equal(aegisResult?.block, true);
      assert.match(aegisResult?.reason ?? "", /Aegis/);
      assert.equal(legacyResult, undefined);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("persists and restores only the Aegis enabled state", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pithos-aegis-"));
    try {
      const harness = createHarness();
      const legacyContext = createContext(cwd, [
        { type: "custom", customType: "command-guard-enabled", data: { enabled: false } },
      ]);
      await emit(harness, "session_start", {}, legacyContext);

      const initialStatus = await harness.commands.get("aegis")!.handler("status", legacyContext);
      assert.match(String(initialStatus), /Aegis is enabled/);

      await harness.commands.get("aegis")!.handler("toggle", legacyContext);
      assert.deepEqual(harness.entries.at(-1), {
        type: "aegis-enabled",
        data: { enabled: false },
      });

      const restoredHarness = createHarness();
      const restoredContext = createContext(cwd, [
        { type: "custom", customType: "aegis-enabled", data: { enabled: false } },
      ]);
      await emit(restoredHarness, "session_start", {}, restoredContext);
      const restoredStatus = await restoredHarness.commands.get("aegis")!.handler("status", restoredContext);
      assert.match(String(restoredStatus), /Aegis is disabled/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
