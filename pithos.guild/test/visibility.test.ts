import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GuildRunTracker } from "../src/visibility";

describe("Guild member run visibility", () => {
  it("shows every concurrent run with identity, permissions, model, thinking, task, and elapsed time", () => {
    const tracker = new GuildRunTracker();
    tracker.start({
      id: "run-1",
      member: "dotnet-architect",
      source: "builtin",
      role: "architect",
      task: "Design order cancellation",
      model: "openai-codex/gpt-5.6-sol",
      thinkingLevel: "xhigh",
      tools: ["read", "grep", "find", "ls"],
      startedAt: 1_000,
    });
    tracker.start({
      id: "run-2",
      member: "angular-coder",
      source: "project",
      role: "coder",
      task: "Implement the checkout loading state",
      model: "anthropic/claude-sonnet-4-5",
      thinkingLevel: "high",
      tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
      startedAt: 2_000,
    });
    tracker.update("run-1", { turns: 2 });

    const lines = tracker.formatLines(6_000);
    const text = lines.join("\n");

    assert.match(lines[0], /2 active/);
    assert.match(text, /dotnet-architect.*builtin.*read-only.*5s/);
    assert.match(text, /Design order cancellation/);
    assert.match(text, /openai-codex\/gpt-5\.6-sol.*xhigh.*2 turns/);
    assert.match(text, /angular-coder.*project.*write-enabled.*4s/);
    assert.match(text, /read, grep, find, ls, edit, write, bash/);
  });

  it("removes finished runs from the active-only display", () => {
    const tracker = new GuildRunTracker();
    const base = {
      source: "builtin" as const,
      role: "architect" as const,
      task: "Task",
      model: "model",
      thinkingLevel: "low",
      tools: ["read"],
      startedAt: 0,
    };
    tracker.start({ ...base, id: "one", member: "dotnet-architect" });
    tracker.start({ ...base, id: "two", member: "frontend-architect" });

    tracker.finish("one");
    assert.equal(tracker.size, 1);
    assert.doesNotMatch(tracker.formatLines(1_000).join("\n"), /dotnet-architect|recent|completed/);
    assert.match(tracker.formatLines(1_000).join("\n"), /⏳ frontend-architect/);

    tracker.finish("two");
    assert.equal(tracker.size, 0);
    assert.deepEqual(tracker.formatLines(2_000), []);

    tracker.start({ ...base, id: "three", member: "dotnet-architect", startedAt: 3_000 });
    assert.match(tracker.formatLines(4_000)[0], /^Guild · 1 active$/);
    assert.doesNotMatch(tracker.formatLines(4_000).join("\n"), /frontend-architect|recent|completed/);
  });
});
