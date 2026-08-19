import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTOMATIC_ENTRY_TYPE,
  fingerprintMarkdown,
  TranslationDisplayCache,
  type AutomaticTranslationRecord,
} from "../src/display-cache.ts";

function record(source: string, translated: string): AutomaticTranslationRecord {
  return {
    version: 1,
    language: "French",
    model: "provider/model",
    sourceFingerprint: fingerprintMarkdown(source),
    blocks: [{ source, sourceFingerprint: fingerprintMarkdown(source), translated }],
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: 0 },
    timestamp: 1,
  };
}

describe("automatic translation display cache", () => {
  it("renders a safe persisted-language marker above a successful automatic translation", () => {
    const cache = new TranslationDisplayCache();
    cache.add(record("Hello", "Bonjour"));

    assert.equal(
      cache.transform("Hello", { messageType: "assistant", isStreaming: false }, true),
      "*Translated · French*\n\nBonjour",
    );

    cache.restore([{
      type: "custom",
      customType: AUTOMATIC_ENTRY_TYPE,
      data: {
        ...record("Welcome", "Bienvenue"),
        language: "  Fran\\çais\n *[unsafe](https://example.com)*  ",
      },
    }]);
    assert.equal(
      cache.transform("Welcome", { messageType: "assistant", isStreaming: false }, false),
      "*Translated · Fran\\\\çais \\*\\[unsafe\\]\\(https\\:\\/\\/example\\.com\\)\\**\n\nBienvenue",
    );
  });

  it("restores valid active-branch records and transforms assistant Markdown display-only", () => {
    const cache = new TranslationDisplayCache();
    cache.restore([
      { type: "custom", customType: AUTOMATIC_ENTRY_TYPE, data: record("Hello", "Bonjour") },
      {
        type: "custom",
        customType: AUTOMATIC_ENTRY_TYPE,
        data: { ...record("Invalid", "Invalide"), sourceFingerprint: "wrong" },
      },
      { type: "custom", customType: "other", data: record("Ignored", "Ignoré") },
    ]);

    assert.equal(
      cache.transform("Hello", { messageType: "assistant", isStreaming: false }, false),
      "*Translated · French*\n\nBonjour",
    );
    assert.equal(cache.transform("Hello", { messageType: "user", isStreaming: false }, true), "Hello");
    assert.equal(cache.transform("Hello", { messageType: "assistant-thinking", isStreaming: false }, true), "Hello");
    assert.equal(cache.transform("Invalid", { messageType: "assistant", isStreaming: false }, true), "Invalid");
    assert.equal(
      cache.transform("Still writing", { messageType: "assistant", isStreaming: true }, true),
      "",
      "automatic streaming prose is suppressed without adding an assistant placeholder",
    );
    assert.equal(cache.transform("Still writing", { messageType: "assistant", isStreaming: true }, false), "Still writing");

    cache.add(record("Repeat", "Répéter"));
    cache.add(record("Repeat", "Répéter encore"));
    assert.equal(
      cache.transform("Repeat", { messageType: "assistant", isStreaming: false }, true),
      "*Translated · French*\n\nRépéter encore",
    );

    cache.restore([
      { type: "custom", customType: AUTOMATIC_ENTRY_TYPE, data: record("  Resumed source\n", "Source reprise") },
    ]);
    assert.equal(
      cache.transform("Resumed source", { messageType: "assistant", isStreaming: false }, true),
      "*Translated · French*\n\nSource reprise",
      "restored records must correlate with the trim()ed Markdown Pi renders",
    );
  });

  it("replays newer persisted suppressions without rejecting old automatic records", () => {
    const cache = new TranslationDisplayCache();
    const mermaid = "```mermaid\ngraph TD\n  A --> B\n```";
    const prose = "Plain prose";
    cache.restore([
      { type: "custom", customType: AUTOMATIC_ENTRY_TYPE, data: record(mermaid, "Ancien diagramme") },
      { type: "custom", customType: AUTOMATIC_ENTRY_TYPE, data: record(prose, "Ancienne prose") },
      {
        type: "custom",
        customType: AUTOMATIC_ENTRY_TYPE,
        data: {
          version: 2,
          language: "French",
          model: "provider/model",
          sourceFingerprint: fingerprintMarkdown(`${mermaid}\n\n${prose}`),
          outcomes: [
            { kind: "suppressed", source: mermaid, sourceFingerprint: fingerprintMarkdown(mermaid) },
            {
              kind: "translated",
              source: prose,
              sourceFingerprint: fingerprintMarkdown(prose),
              translated: "Nouvelle prose",
            },
          ],
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: 0 },
          timestamp: 2,
        },
      },
    ]);

    assert.equal(cache.transform(mermaid, { messageType: "assistant", isStreaming: false }, true), mermaid);
    assert.equal(
      cache.transform(prose, { messageType: "assistant", isStreaming: false }, true),
      "*Translated · French*\n\nNouvelle prose",
    );
  });
});
