import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  createGuildHandoverProgress,
  createGuildPanel,
  renderGuildCall,
  renderGuildLifecycleMessage,
  renderGuildResult,
} from "../src/ui";

initTheme();

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

describe("Guild visual presentation", () => {
  it("renders the summary and each live run on separate lines with balanced half-row edges", () => {
    const backgrounds: string[] = [];
    const panelTheme = {
      name: "auric-light",
      fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
      bg: (color: string, text: string) => {
        backgrounds.push(color);
        return text;
      },
      bold: (_text: string) => {
        throw new Error("the aggregate dashboard should not request bold text");
      },
      getBgAnsi: () => "\u001b[48;2;223;236;243m",
      getColorMode: () => "truecolor",
    } as any;
    const panel = createGuildPanel([
      "Guild · 2 active",
      "⏳ dotnet-architect · 5s · 2 turns",
      "⏳ angular-coder · 49m 38s",
    ], panelTheme);

    const lines = panel.render(400);
    const rendered = lines.join("\n");
    assert.equal(lines.length, 5);
    assert.match(lines[0] ?? "", /^\u001b\[38;2;233;221;242m▄+/);
    assert.match(lines[1] ?? "", /^\u001b\[48;2;233;221;242m <accent>Guild<\/accent><muted> · 2 active<\/muted>/);
    assert.match(lines[2] ?? "", /^\u001b\[48;2;233;221;242m <warning>●<\/warning> <accent>dotnet-architect<\/accent><dim> · 5s · 2 turns<\/dim>/);
    assert.match(lines[3] ?? "", /^\u001b\[48;2;233;221;242m <warning>●<\/warning> <accent>angular-coder<\/accent><dim> · 49m 38s<\/dim>/);
    assert.match(lines[4] ?? "", /^\u001b\[38;2;233;221;242m▀+/);
    assert.deepEqual(backgrounds, []);
    assert.doesNotMatch(rendered, /Running|Design order cancellation|openai-codex|read, grep|built-in|read only/);
  });

  it("uses a dedicated Guild background for dark themes", () => {
    const panelTheme = {
      name: "auric-dark",
      fg: (_color: string, text: string) => text,
      bg: () => {
        throw new Error("the Guild panel should not use a standard theme background");
      },
      getBgAnsi: () => "\u001b[48;2;30;30;36m",
      getColorMode: () => "truecolor",
    } as any;

    const lines = createGuildPanel(["Guild · 1 active", "⏳ csharp-coder · 3s"], panelTheme).render(80);
    assert.match(lines[0] ?? "", /^\u001b\[38;2;45;37;56m▄+/);
    assert.match(lines[1] ?? "", /^\u001b\[48;2;45;37;56m Guild · 1 active/);
    assert.match(lines[2] ?? "", /^\u001b\[48;2;45;37;56m ● csharp-coder · 3s/);
    assert.match(lines[3] ?? "", /^\u001b\[38;2;45;37;56m▀+/);
  });

  it("renders a fancy, width-capped lifecycle card with real Markdown", () => {
    const details = {
      runId: "guild-command-123",
      initiatedBy: "user",
      member: "dotnet-architect",
      memberSource: "builtin",
      role: "architect",
      task: "Explore the repository and report any .NET artifacts",
      inheritedModel: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "xhigh",
      elapsedMs: 40_800,
      usage: { turns: 4, cost: 0.1121 },
      status: "completed",
      output: "### Summary\n\nI found **no actual .NET artifacts**.",
    };

    const lines = renderGuildLifecycleMessage(
      { content: "lifecycle", details },
      { expanded: false },
      theme,
    ).render(180);
    const rendered = lines.join("\n");

    assert.ok(lines.every((line) => visibleWidth(line) <= 110));
    assert.match(rendered, /╭─.*Guild Relay.*\[✓ Completed\].*─╮/);
    assert.match(rendered, /dotnet-architect.*built-in.*read-only/i);
    assert.match(rendered, /Request.*Explore the repository/);
    assert.doesNotMatch(rendered, /USER|MISSION|built-in.*architect.*read-only/i);
    assert.match(rendered, /REPORT/);
    assert.match(rendered, /Summary/);
    assert.match(rendered, /no actual \.NET artifacts/);
    assert.match(rendered, /expand report/);
    assert.doesNotMatch(rendered, /###|\*\*|◇|◆/);
  });

  it("uses compact framed treatments for failed and cancelled handovers", () => {
    const base = {
      runId: "guild-command-123",
      initiatedBy: "user",
      member: "csharp-coder",
      memberSource: "builtin",
      role: "coder",
      task: "Implement validation",
      elapsedMs: 2500,
    };
    const failed = renderGuildLifecycleMessage(
      { content: "lifecycle", details: { ...base, status: "failed", error: "Provider failed" } },
      { expanded: false },
      theme,
    ).render(100).join("\n");
    assert.match(failed, /\[✗ Failed\]/);
    assert.match(failed, /DIAGNOSTICS/);
    assert.match(failed, /Provider failed/);

    const cancelled = renderGuildLifecycleMessage(
      { content: "lifecycle", details: { ...base, status: "cancelled" } },
      { expanded: false },
      theme,
    ).render(100).join("\n");
    assert.match(cancelled, /\[■ Cancelled\]/);
    assert.match(cancelled, /Request.*Implement validation/);
    assert.ok(cancelled.split("\n").length <= 5);
  });

  it("renders animated live activity and exposes cancellable progress", () => {
    let renders = 0;
    const progress = createGuildHandoverProgress({
      member: "dotnet-architect",
      memberSource: "builtin",
      role: "architect",
      task: "Explore the repository and report any .NET artifacts",
      startedAt: Date.now(),
    }, {
      requestRender: () => { renders += 1; },
    } as any, theme, {
      matches: (data: string, binding: string) => data === "escape" && binding === "tui.select.cancel",
    } as any);

    try {
      const initial = progress.render(180);
      assert.ok(initial.every((line) => visibleWidth(line) <= 110));
      assert.match(initial.join("\n"), /Guild Relay.*\[● Running\s+00:00\]/);
      assert.match(initial.join("\n"), /dotnet-architect.*built-in.*read-only/i);
      assert.match(initial.join("\n"), /Request.*Explore the repository/);
      assert.match(initial.join("\n"), /Starting handover.*cancel/);
      assert.ok(initial.length <= 5);
      assert.doesNotMatch(initial.join("\n"), /USER|MISSION|◇|◆|openai-codex/);

      progress.update({ activity: "Scanning repository", activityTool: "find", turns: 2 });
      const active = progress.render(100).join("\n");
      assert.match(active, /Scanning repository/);
      assert.match(active, /find · 2 turns/);
      assert.ok(renders > 0);

      progress.handleInput("escape");
      assert.equal(progress.signal.aborted, true);
      assert.match(progress.render(100).join("\n"), /Cancelling/);
    } finally {
      progress.dispose();
    }
  });

  it("uses color and spacing instead of bold direct-handover chrome", () => {
    const lightweightTheme = {
      ...theme,
      bold: (_text: string) => {
        throw new Error("direct handover chrome should not request bold text");
      },
    } as any;
    const details = {
      status: "completed",
      member: "dotnet-architect",
      memberSource: "builtin",
      role: "architect",
      task: "Inspect repository",
      elapsedMs: 1000,
      output: "Inspection complete.",
    };

    assert.doesNotThrow(() => renderGuildLifecycleMessage(
      { content: "lifecycle", details },
      { expanded: false },
      lightweightTheme,
    ).render(90));

    const progress = createGuildHandoverProgress({
      member: "dotnet-architect",
      memberSource: "builtin",
      role: "architect",
      task: "Inspect repository",
      startedAt: Date.now(),
    }, { requestRender: () => undefined } as any, lightweightTheme, { matches: () => false } as any);
    try {
      assert.doesNotThrow(() => progress.render(90));
    } finally {
      progress.dispose();
    }
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
