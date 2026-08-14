import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GuildRunTracker } from "../src/visibility";

describe("Guild member run visibility", () => {
  it("shows every concurrent run with only identity, elapsed time, and turns", () => {
    const tracker = new GuildRunTracker();
    tracker.start({
      id: "run-1",
      member: "dotnet-architect",
      startedAt: 1_000,
    });
    tracker.start({
      id: "run-2",
      member: "angular-coder",
      startedAt: 2_000,
    });
    tracker.update("run-1", { turns: 2 });

    const lines = tracker.formatLines(6_000);

    assert.deepEqual(lines, [
      "Guild · 2 active",
      "⏳ dotnet-architect · 5s · 2 turns",
      "⏳ angular-coder · 4s",
    ]);
  });

  it("formats long elapsed times as readable units", () => {
    const tracker = new GuildRunTracker();
    tracker.start({
      id: "long-run",
      member: "angular-coder",
      startedAt: 2_000,
    });

    const text = tracker.formatLines(2_980_000).join("\n");

    assert.match(text, /angular-coder.*49m 38s/);
    assert.doesNotMatch(text, /2978s/);
  });

  it("removes finished runs from the active-only display", () => {
    const tracker = new GuildRunTracker();
    const base = {
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
