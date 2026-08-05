import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGuildPanel, renderGuildCall, renderGuildLifecycleMessage, renderGuildResult } from "../src/ui";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

describe("Guild visual presentation", () => {
  it("renders a framed aggregate operations panel with status and metadata", () => {
    const panel = createGuildPanel([
      "Guild · 2 active",
      "⏳ dotnet-architect · builtin · read-only · 5s",
      "   Task: Design order cancellation",
      "   Model: openai-codex/gpt-5.6-sol · thinking xhigh · 2 turns",
      "   Tools: read, grep, find, ls",
      "⏳ angular-coder · project · write-enabled · 3s",
      "   Task: Implement loading state",
    ], theme);

    const rendered = panel.render(100).join("\n");
    assert.match(rendered, /✦ Guild Operations/);
    assert.match(rendered, /● RUNNING.*dotnet-architect/);
    assert.match(rendered, /READ ONLY/);
    assert.match(rendered, /● RUNNING.*angular-coder/);
    assert.match(rendered, /WRITE ENABLED/);
    assert.match(rendered, /─/);
  });

  it("renders started, completed, failed, and cancelled direct-handover lifecycle cards", () => {
    const base = {
      runId: "guild-command-123",
      initiatedBy: "user",
      member: "csharp-coder",
      memberSource: "builtin",
      role: "coder",
      task: "Implement order validation",
      inheritedModel: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "xhigh",
      elapsedMs: 2500,
    };

    const started = renderGuildLifecycleMessage(
      { content: "lifecycle", details: { ...base, status: "started" } },
      { expanded: false },
      theme,
    ).render(100).join("\n");
    assert.match(started, /✦ Guild Handover/);
    assert.match(started, /Started.*csharp-coder/);
    assert.match(started, /USER INITIATED/);
    assert.match(started, /Implement order validation/);

    const completed = renderGuildLifecycleMessage(
      { content: "lifecycle", details: { ...base, status: "completed", output: "## Status\nCompleted successfully." } },
      { expanded: true },
      theme,
    ).render(100).join("\n");
    assert.match(completed, /Completed.*csharp-coder/);
    assert.match(completed, /Completed successfully/);
    assert.match(completed, /guild-command-123/);

    const failed = renderGuildLifecycleMessage(
      { content: "lifecycle", details: { ...base, status: "failed", error: "Provider failed" } },
      { expanded: false },
      theme,
    ).render(100).join("\n");
    assert.match(failed, /Failed.*csharp-coder/);
    assert.match(failed, /Provider failed/);

    const cancelled = renderGuildLifecycleMessage(
      { content: "lifecycle", details: { ...base, status: "cancelled" } },
      { expanded: false },
      theme,
    ).render(100).join("\n");
    assert.match(cancelled, /Cancelled.*csharp-coder/);
  });

  it("renders polished call and expandable completion cards", () => {
    const call = renderGuildCall({
      member: "csharp-coder",
      task: "Implement order validation",
    }, theme);
    assert.match(call.render(100).join("\n"), /✦ Guild.*csharp-coder/);
    assert.match(call.render(100).join("\n"), /Implement order validation/);

    const details = {
      status: "completed",
      member: "csharp-coder",
      memberSource: "builtin",
      role: "coder",
      tools: ["read", "edit", "bash"],
      inheritedModel: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "xhigh",
      elapsedMs: 2500,
      usage: { turns: 2, cost: 0.01 },
      output: "## Status\nCompleted successfully.",
    };
    const result = renderGuildResult(
      { content: [{ type: "text", text: details.output }], details },
      { expanded: true, isPartial: false },
      theme,
    );
    const rendered = result.render(100).join("\n");
    assert.match(rendered, /✓ Completed.*csharp-coder/);
    assert.match(rendered, /2 turns/);
    assert.match(rendered, /Completed successfully/);
  });
});
