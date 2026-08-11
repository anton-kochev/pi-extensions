import assert from "node:assert/strict";
import { describe, it } from "node:test";
import contextBar from "../src/context-bar.ts";

type Handler = (event: any, context: any) => unknown;

function createHarness(branch: any[] = []) {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, { handler: Handler; description?: string }>();
  const entries: Array<{ type: string; data: unknown }> = [];
  const widgets: Array<{ key: string; content: unknown; options: unknown }> = [];
  const editorFactories: unknown[] = [];
  let editorFactory: unknown;
  const notifications: Array<{ message: string; type: string | undefined }> = [];
  const runtime = {
    systemPrompt: "",
    usage: { tokens: null as number | null, contextWindow: 100, percent: null as number | null },
    usageReads: 0,
  };
  const pi = {
    on: (event: string, handler: Handler) => {
      const registered = handlers.get(event) ?? [];
      registered.push(handler);
      handlers.set(event, registered);
    },
    registerCommand: (name: string, options: { handler: Handler; description?: string }) => {
      commands.set(name, options);
    },
    appendEntry: (type: string, data: unknown) => entries.push({ type, data }),
    getActiveTools: () => [],
    getAllTools: () => [],
  };
  contextBar(pi as never);

  const context = {
    mode: "tui",
    hasUI: true,
    ui: {
      setWidget: (key: string, content: unknown, options: unknown) => {
        widgets.push({ key, content, options });
      },
      setEditorComponent: (factory: unknown) => {
        editorFactory = factory;
        editorFactories.push(factory);
      },
      getEditorComponent: () => editorFactory,
      notify: (message: string, type?: string) => notifications.push({ message, type }),
      theme: { fg: (_color: string, text: string) => text },
    },
    model: { provider: "openai", id: "gpt-test", contextWindow: 100 },
    sessionManager: {
      getBranch: () => branch,
      buildContextEntries: () => [],
    },
    getSystemPrompt: () => runtime.systemPrompt,
    getSystemPromptOptions: () => ({ cwd: "/repo" }),
    getContextUsage: () => {
      runtime.usageReads++;
      return runtime.usage;
    },
  };

  return { handlers, commands, entries, widgets, editorFactories, notifications, runtime, context };
}

async function emit(harness: ReturnType<typeof createHarness>, event: string, payload: object = {}) {
  for (const handler of harness.handlers.get(event) ?? []) {
    await handler({ type: event, ...payload }, harness.context);
  }
}

describe("context-bar extension", () => {
  it("registers the command and installs an enabled above-editor widget for TUI sessions", async () => {
    const harness = createHarness();

    await emit(harness, "session_start", { reason: "startup" });

    assert.ok(harness.commands.has("context-bar"));
    assert.equal(harness.widgets.at(-1)?.key, "context-bar");
    assert.equal(typeof harness.widgets.at(-1)?.content, "function");
    assert.deepEqual(harness.widgets.at(-1)?.options, { placement: "aboveEditor" });
    assert.equal(typeof harness.editorFactories.at(-1), "function");
  });

  it("toggles the widget and persists each explicit state change", async () => {
    const harness = createHarness();
    await emit(harness, "session_start", { reason: "startup" });
    const command = harness.commands.get("context-bar")!;

    await command.handler("", harness.context);
    assert.equal(harness.widgets.at(-1)?.content, undefined);
    assert.equal(harness.editorFactories.at(-1), undefined);
    assert.deepEqual(harness.entries.at(-1), {
      type: "context-bar-enabled",
      data: { enabled: false },
    });

    await command.handler("", harness.context);
    assert.equal(typeof harness.widgets.at(-1)?.content, "function");
    assert.equal(typeof harness.editorFactories.at(-1), "function");
    assert.deepEqual(harness.entries.at(-1), {
      type: "context-bar-enabled",
      data: { enabled: true },
    });
  });

  it("supports idempotent explicit on and off arguments", async () => {
    const harness = createHarness();
    await emit(harness, "session_start", { reason: "startup" });
    const command = harness.commands.get("context-bar")!;

    await command.handler("off", harness.context);
    assert.equal(harness.widgets.at(-1)?.content, undefined);
    assert.deepEqual(harness.entries.at(-1)?.data, { enabled: false });
    const entryCount = harness.entries.length;

    await command.handler("off", harness.context);
    assert.equal(harness.entries.length, entryCount);

    await command.handler("on", harness.context);
    assert.equal(typeof harness.widgets.at(-1)?.content, "function");
    assert.deepEqual(harness.entries.at(-1)?.data, { enabled: true });
  });

  it("reports the detailed status and legend without changing state", async () => {
    const harness = createHarness();
    await emit(harness, "session_start", { reason: "startup" });
    const command = harness.commands.get("context-bar")!;
    const widgetCount = harness.widgets.length;

    await command.handler("status", harness.context);

    assert.equal(harness.entries.length, 0);
    assert.equal(harness.widgets.length, widgetCount);
    assert.match(harness.notifications.at(-1)?.message ?? "", /context-bar is on/);
    assert.match(harness.notifications.at(-1)?.message ?? "", /Approximate composition:/);
  });

  it("restores the latest enabled state from the active session branch", async () => {
    const harness = createHarness([
      { type: "custom", customType: "context-bar-enabled", data: { enabled: true } },
      { type: "custom", customType: "context-bar-enabled", data: { enabled: false } },
    ]);

    await emit(harness, "session_start", { reason: "resume" });

    assert.equal(harness.widgets.at(-1)?.content, undefined);
  });

  it("observes prompt, context, model, compaction, message, and settled lifecycle boundaries", () => {
    const harness = createHarness();
    const expectedEvents = [
      "before_agent_start",
      "agent_start",
      "context",
      "message_end",
      "agent_settled",
      "model_select",
      "session_compact",
      "session_tree",
      "session_shutdown",
    ];

    for (const event of expectedEvents) {
      assert.ok(harness.handlers.has(event), `missing ${event} handler`);
    }
  });

  it("skips snapshot recomputation while disabled", async () => {
    const harness = createHarness();
    await emit(harness, "session_start", { reason: "startup" });
    await harness.commands.get("context-bar")!.handler("off", harness.context);
    const readsWhileDisabling = harness.runtime.usageReads;

    await emit(harness, "context", { messages: [{ role: "user", content: "large context" }] });
    await emit(harness, "agent_settled", {});

    assert.equal(harness.runtime.usageReads, readsWhileDisabling);
  });

  it("uses a local total when a changed effective request makes provider usage stale", async () => {
    const harness = createHarness();
    await emit(harness, "session_start", { reason: "startup" });
    harness.runtime.usage = { tokens: 90, contextWindow: 100, percent: 90 };
    await emit(harness, "message_end", {
      message: {
        role: "assistant",
        provider: "openai",
        model: "gpt-test",
        stopReason: "stop",
        usage: { totalTokens: 90 },
        content: [],
      },
    });
    const renderLatest = () => {
      const factory = harness.widgets.at(-1)?.content as (tui: unknown, theme: unknown) => {
        render(width: number): string[];
      };
      const component = factory(
        { requestRender: () => {} },
        { fg: (_color: string, text: string) => text },
      );
      return component.render(12)[0]!;
    };
    assert.ok(renderLatest().endsWith("90%"));

    const changedPrompt = "p".repeat(400);
    await emit(harness, "before_agent_start", {
      prompt: "next",
      systemPrompt: changedPrompt,
      systemPromptOptions: { cwd: "/repo" },
    });

    assert.ok(renderLatest().endsWith("100%"));
  });

  it("refreshes at lifecycle boundaries and clears the widget on shutdown", async () => {
    const harness = createHarness();
    await emit(harness, "session_start", { reason: "startup" });
    const initialWidgetCount = harness.widgets.length;

    await emit(harness, "before_agent_start", {
      prompt: "hello",
      systemPrompt: "system",
      systemPromptOptions: { cwd: "/repo" },
    });
    await emit(harness, "context", { messages: [{ role: "user", content: "hello" }] });
    await emit(harness, "model_select", {});
    await emit(harness, "session_compact", {});

    assert.equal(harness.widgets.length, initialWidgetCount);
    assert.equal(typeof harness.widgets.at(-1)?.content, "function");

    await emit(harness, "session_shutdown", { reason: "reload" });
    assert.equal(harness.widgets.length, initialWidgetCount + 1);
    assert.equal(harness.widgets.at(-1)?.content, undefined);
    assert.equal(harness.editorFactories.at(-1), undefined);
  });

  it("shows package-local help for --help and -h without toggling the bar", async () => {
    for (const alias of ["--help", "-h"]) {
      const harness = createHarness();
      const command = harness.commands.get("context-bar")!;

      await command.handler(alias, harness.context);

      assert.equal(harness.notifications.length, 1);
      assert.equal(harness.notifications[0]?.type, "info");
      assert.match(harness.notifications[0]?.message ?? "", /Usage: \/context-bar \[on\|off\|status\]/);
      assert.match(harness.notifications[0]?.message ?? "", /--help, -h/);
      assert.equal(harness.entries.length, 0);
      assert.equal(harness.widgets.length, 0);
    }
  });

  it("reports command usage for unsupported arguments", async () => {
    const harness = createHarness();
    const command = harness.commands.get("context-bar")!;

    await command.handler("sometimes", harness.context);

    assert.equal(harness.notifications.at(-1)?.type, "warning");
    assert.match(harness.notifications.at(-1)?.message ?? "", /on\|off\|status/);
  });
});
