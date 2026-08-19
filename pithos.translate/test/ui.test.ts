import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runTranslationWithUi } from "../src/ui.ts";

describe("translation UI", () => {
  it("does not start translation when a real TUI is unavailable", async () => {
    let calls = 0;
    const result = await runTranslationWithUi(
      { mode: "rpc", signal: undefined, ui: { custom: async () => undefined } } as never,
      "French",
      "provider/model",
      async () => {
        calls++;
        return { ok: true, markdown: "must not run", usage: {} as never };
      },
    );

    assert.equal(calls, 0);
    assert.deepEqual(result, {
      ok: false,
      kind: "unsupported-mode",
      error: "Translation display is available only in Pi's interactive TUI.",
    });
  });

  it("turns a dismissed TUI loader into cancellation without a partial result", async () => {
    const context = {
      mode: "tui",
      ui: {
        custom: async () => undefined,
      },
    };
    const result = await runTranslationWithUi(
      context as never,
      "French",
      "provider/model",
      async () => {
        throw new Error("the fake dismissed before starting the task");
      },
    );

    assert.deepEqual(result, { ok: false, kind: "cancelled", error: "Translation cancelled." });
  });
});
