import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { TargetLanguageInput } from "../src/language-input.ts";

const theme = {
  bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
  fg: (_color: string, text: string) => `\u001b[36m${text}\u001b[39m`,
};

describe("target language input", () => {
  it("renders a themed label and placeholder on exactly one line", () => {
    const input = new TargetLanguageInput(
      { requestRender: () => {} } as never,
      theme as never,
      undefined,
      () => {},
    );
    input.focused = true;

    const lines = input.render(80);

    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? "", /Target language/);
    assert.match(lines[0] ?? "", /English, Ukrainian, …/);
    assert.ok(visibleWidth(lines[0] ?? "") <= 80);
  });

  it("prefills the current language and submits edited single-line input", () => {
    let renders = 0;
    let submitted: string | undefined;
    const input = new TargetLanguageInput(
      { requestRender: () => { renders++; } } as never,
      theme as never,
      "French",
      (value) => { submitted = value; },
    );

    assert.doesNotMatch(input.render(40)[0] ?? "", /English, Ukrainian/);
    input.handleInput(" (Canada)");
    input.handleInput("\n");

    assert.equal(submitted, "French (Canada)");
    assert.equal(renders, 2);
  });

  it("returns undefined when cancelled", () => {
    let submitted = "not-called" as string | undefined;
    const input = new TargetLanguageInput(
      { requestRender: () => {} } as never,
      theme as never,
      undefined,
      (value) => { submitted = value; },
    );

    input.handleInput("\u001b");

    assert.equal(submitted, undefined);
  });
});
