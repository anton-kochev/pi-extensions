import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { containsMermaidFence, protectMarkdown, restoreMarkdown } from "../src/markdown-protection.ts";

describe("Markdown protection", () => {
  it("detects Mermaid from Pi's first info token when the fence has trailing options", () => {
    for (const source of [
      "```mermaid theme=dark\ngraph TD\n```",
      "~~~  MERMAID\tconfig={theme:dark}\ngraph TD\n~~~",
      "```mermaid\u00a0theme=dark\ngraph TD\n```",
    ]) {
      assert.equal(containsMermaidFence(source), true);
    }

    assert.equal(containsMermaidFence("```mermaidish theme=dark\ngraph TD\n```"), false);
    assert.equal(containsMermaidFence("```theme=dark mermaid\ngraph TD\n```"), false);
  });

  it("ignores Mermaid-looking lines nested inside a longer non-Mermaid fence", () => {
    const source = [
      "````markdown",
      "A literal Mermaid example:",
      "```mermaid theme=dark",
      "graph TD",
      "```",
      "````",
      "Prose that still needs translation.",
    ].join("\n");

    assert.equal(containsMermaidFence(source), false);
  });

  it("closes inline code only with an exactly equal backtick run", () => {
    const source = "Before ``alpha ``` beta`` after";
    const protectedMarkdown = protectMarkdown(source);

    assert.deepEqual(protectedMarkdown.values, ["``alpha ``` beta``"]);
    assert.equal(protectedMarkdown.markdown, "Before ⟦PITHOS_TRANSLATE_0000⟧ after");
    assert.equal(restoreMarkdown(protectedMarkdown.markdown, protectedMarkdown), source);
  });

  it("round-trips fenced code, inline code, and link destinations byte-for-byte", () => {
    const source = [
      "Explain `const answer = 42` and [the docs](https://example.com/a_(b)?q=x#y).",
      "",
      "  ~~~~ts",
      "const path = `/tmp/a b`;",
      "  ~~~~",
      "",
      "Keep [nested](<https://example.com/a b>) destination.",
      "",
      "```sh",
      "npm test",
      "```",
    ].join("\n");
    const protectedMarkdown = protectMarkdown(source);

    assert.doesNotMatch(protectedMarkdown.markdown, /const answer|https:\/\/example|~~~~ts|npm test/);
    assert.match(protectedMarkdown.markdown, /PITHOS_TRANSLATE_0000/);
    assert.equal(restoreMarkdown(protectedMarkdown.markdown, protectedMarkdown), source);
  });

  it("protects reference destinations, autolinks, and bare URLs", () => {
    const source = [
      "Read [the guide][docs], visit <https://example.com/auto?q=1>, or open https://example.com/a_(b)?q=2.",
      "Email <mailto:team@example.com> or mailto:help@example.com.",
      "",
      "[docs]: https://example.com/reference_(v2) \"Guide\"",
    ].join("\n");
    const protectedMarkdown = protectMarkdown(source);

    assert.doesNotMatch(protectedMarkdown.markdown, /https?:\/\/|mailto:|\[docs\]/);
    assert.equal(restoreMarkdown(protectedMarkdown.markdown, protectedMarkdown), source);
  });

  it("rejects altered, missing, duplicated, and invented placeholders", () => {
    const protection = protectMarkdown("Use `npm test` and [docs](https://example.com). ");
    const [first, second] = protection.markdown.match(/⟦PITHOS_TRANSLATE_\d{4}⟧/g) ?? [];
    assert.ok(first);
    assert.ok(second);

    assert.throws(() => restoreMarkdown(protection.markdown.replace(first, ""), protection), /placeholder/i);
    assert.throws(() => restoreMarkdown(`${protection.markdown}${first}`, protection), /placeholder/i);
    assert.throws(
      () => restoreMarkdown(protection.markdown.replace(first, "⟦PITHOS_TRANSLATE_9999⟧"), protection),
      /placeholder/i,
    );
    assert.throws(
      () => restoreMarkdown(protection.markdown.replace(second, "⟦PITHOS_TRANSLATE_001⟧"), protection),
      /placeholder/i,
    );
  });

  it("protects backtick and tilde CRLF fences without hiding prose after the closing fence", () => {
    for (const marker of ["```", "~~~~"] as const) {
      const source = `Before\r\n${marker}ts\r\nconst value = 1;\r\n${marker}\r\nAfter`;
      const protectedMarkdown = protectMarkdown(source);

      assert.doesNotMatch(protectedMarkdown.markdown, /const value/);
      assert.match(protectedMarkdown.markdown, /Before\r\n/);
      assert.match(protectedMarkdown.markdown, /\r\nAfter$/);
      assert.equal(restoreMarkdown(protectedMarkdown.markdown, protectedMarkdown), source);
    }
  });

  it("protects shortcut references only when their definitions exist", () => {
    const source = [
      "Keep [API Guide] and ![Architecture] linked, but translate [ordinary prose].",
      "",
      "[api guide]: https://example.com/api",
      "[architecture]: ./architecture.svg",
    ].join("\n");
    const protectedMarkdown = protectMarkdown(source);

    assert.doesNotMatch(protectedMarkdown.markdown, /\[API Guide\]|!\[Architecture\]/);
    assert.match(protectedMarkdown.markdown, /\[ordinary prose\]/);
    assert.equal(restoreMarkdown(protectedMarkdown.markdown, protectedMarkdown), source);
  });
});
