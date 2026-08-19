import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getEligibleTextBlocks, latestEligibleAssistant, translateMarkdown } from "../src/translation.ts";

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(content: unknown[], stopReason = "stop") {
  return { role: "assistant", content, stopReason, provider: "p", model: "m", api: "test", usage, timestamp: 1 };
}

describe("assistant prose eligibility", () => {
  it("accepts only successful terminal assistant text without tool calls", () => {
    assert.deepEqual(getEligibleTextBlocks(assistant([
      { type: "thinking", thinking: "hidden" },
      { type: "text", text: " \n First block \n " },
      { type: "text", text: "Second block" },
    ])), ["First block", "Second block"]);

    for (const message of [
      assistant([{ type: "text", text: "" }]),
      assistant([{ type: "text", text: "prose" }, { type: "toolCall", id: "1", name: "read", arguments: {} }], "toolUse"),
      assistant([{ type: "text", text: "truncated" }], "length"),
      assistant([{ type: "text", text: "partial" }], "aborted"),
      assistant([{ type: "text", text: "failed" }], "error"),
      { role: "toolResult", content: [{ type: "text", text: "output" }] },
      { role: "custom", content: "extension UI" },
    ]) {
      assert.equal(getEligibleTextBlocks(message), undefined);
    }

    const latest = assistant([{ type: "text", text: "latest" }]);
    const branch = [
      { type: "message", message: assistant([{ type: "text", text: "older" }]) },
      { type: "custom", customType: "card", data: {} },
      { type: "message", message: latest },
      { type: "message", message: { role: "toolResult", content: [] } },
    ];
    assert.equal(latestEligibleAssistant(branch)?.message, latest);
  });

  it("calls only the exact authenticated configured model and restores protected Markdown", async () => {
    const configuredModel = { provider: "openrouter", id: "anthropic/exact-model" };
    const completedWith: Array<{ model: unknown; context: any; options: any }> = [];
    const registry = {
      find: (provider: string, model: string) =>
        provider === "openrouter" && model === "anthropic/exact-model" ? configuredModel : undefined,
      getApiKeyAndHeaders: async (model: unknown) =>
        model === configuredModel ? { ok: true, apiKey: "secret" } : { ok: false, error: "wrong model" },
      complete: async (model: unknown, context: any, options: any) => {
        completedWith.push({ model, context, options });
        const input = context.messages[0].content[0].text as string;
        return {
          ...assistant([{ type: "text", text: input.replace("Read", "Lire") }]),
          usage: { ...usage, input: 12, output: 4, totalTokens: 16 },
        };
      },
    };
    const result = await translateMarkdown(
      "Read `npm test` at [docs](https://example.com).",
      { language: "French", model: "openrouter/anthropic/exact-model", mode: "manual" },
      registry as never,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.markdown, "Lire `npm test` at [docs](https://example.com).");
    assert.equal(result.usage.totalTokens, 16);
    assert.equal(completedWith.length, 1);
    assert.equal(completedWith[0]?.model, configuredModel);
    assert.match(completedWith[0]?.context.systemPrompt ?? "", /faithful Markdown translator/i);
    assert.doesNotMatch(completedWith[0]?.context.messages[0].content[0].text ?? "", /npm test|https:\/\//);

    const unavailable = await translateMarkdown(
      "Never fall back",
      { language: "French", model: "translator/missing", mode: "manual" },
      registry as never,
    );
    assert.deepEqual(unavailable, {
      ok: false,
      kind: "model-unavailable",
      error: "Configured translation model translator/missing is unavailable. Run /translate config.",
    });
    assert.equal(completedWith.length, 1);
  });

  it("preserves usage when a model response fails validation or reports failure", async () => {
    const model = { provider: "translator", id: "exact" };
    const responseUsage = {
      ...usage,
      input: 9,
      output: 3,
      totalTokens: 12,
      cost: { ...usage.cost, input: 0.09, output: 0.03, total: 0.12 },
    };
    const cases = [
      {
        name: "model error",
        source: "Original prose",
        response: { ...assistant([{ type: "text", text: "" }], "error"), errorMessage: "provider rejected request" },
      },
      {
        name: "length stop",
        source: "Original prose",
        response: assistant([{ type: "text", text: "Partial prose" }], "length"),
      },
      {
        name: "empty prose",
        source: "Original prose",
        response: assistant([{ type: "text", text: "  " }]),
      },
      {
        name: "altered placeholder",
        source: "Use `npm test`",
        response: assistant([{ type: "text", text: "Utilisez npm test" }]),
      },
    ];

    for (const testCase of cases) {
      const registry = {
        find: () => model,
        getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "secret" }),
        complete: async () => ({ ...testCase.response, usage: responseUsage }),
      };
      const result = await translateMarkdown(
        testCase.source,
        { language: "French", model: "translator/exact", mode: "manual" },
        registry as never,
      );

      assert.equal(result.ok, false, testCase.name);
      if (result.ok) continue;
      assert.deepEqual(result.usage, responseUsage, testCase.name);
    }
  });

  it("preserves response usage when cancellation is observed after completion returns", async () => {
    const model = { provider: "translator", id: "exact" };
    const responseUsage = {
      ...usage,
      input: 6,
      output: 2,
      totalTokens: 8,
      cost: { ...usage.cost, input: 0.06, output: 0.02, total: 0.08 },
    };

    for (const cancellation of ["aborted-response", "aborted-signal"] as const) {
      const controller = new AbortController();
      const registry = {
        find: () => model,
        getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "secret" }),
        complete: async () => {
          if (cancellation === "aborted-signal") controller.abort();
          return {
            ...assistant([{ type: "text", text: "Partial translation" }], cancellation === "aborted-response" ? "aborted" : "stop"),
            usage: responseUsage,
          };
        },
      };

      const result = await translateMarkdown(
        "Original prose",
        { language: "French", model: "translator/exact", mode: "manual" },
        registry as never,
        controller.signal,
      );

      assert.deepEqual(result, {
        ok: false,
        kind: "cancelled",
        error: "Translation cancelled.",
        usage: responseUsage,
      }, cancellation);
    }
  });

  it("does not invent usage when no model response exists", async () => {
    const model = { provider: "translator", id: "exact" };
    const config = { language: "French", model: "translator/exact", mode: "manual" } as const;
    const unauthenticated = await translateMarkdown("Original prose", config, {
      find: () => model,
      getApiKeyAndHeaders: async () => ({ ok: false, error: "missing key" }),
    } as never);
    const preAbortedController = new AbortController();
    preAbortedController.abort();
    const preAborted = await translateMarkdown("Original prose", config, {
      find: () => model,
      getApiKeyAndHeaders: async () => { throw new Error("must not authenticate after cancellation"); },
    } as never, preAbortedController.signal);
    const thrown = await translateMarkdown("Original prose", config, {
      find: () => model,
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "secret" }),
      complete: async () => { throw new Error("network down"); },
    } as never);

    assert.equal("usage" in unauthenticated, false);
    assert.equal("usage" in preAborted, false);
    assert.equal("usage" in thrown, false);
  });

  it("rejects a length-truncated model translation instead of displaying partial prose", async () => {
    const model = { provider: "translator", id: "exact" };
    const registry = {
      find: () => model,
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "secret" }),
      complete: async () => assistant([{ type: "text", text: "Traduction partielle" }], "length"),
    };
    const result = await translateMarkdown(
      "A complete response",
      { language: "French", model: "translator/exact", mode: "manual" },
      registry as never,
    );

    assert.deepEqual(result, {
      ok: false,
      kind: "invalid-response",
      error: "Translation model stopped before completing the translation.",
      usage,
    });
  });
});
