import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTranslateCommand, TRANSLATE_HELP } from "../src/command-help.ts";

describe("translate command", () => {
  it("parses manual, mode, status, configuration, and help commands", () => {
    assert.deepEqual(parseTranslateCommand(""), { type: "manual" });
    assert.deepEqual(parseTranslateCommand("on"), { type: "on" });
    assert.deepEqual(parseTranslateCommand("off"), { type: "off" });
    assert.deepEqual(parseTranslateCommand("status"), { type: "status" });
    assert.deepEqual(parseTranslateCommand("config"), { type: "config" });
    assert.deepEqual(parseTranslateCommand("--help"), { type: "help" });
    assert.deepEqual(parseTranslateCommand("-h"), { type: "help" });
    assert.match(TRANSLATE_HELP, /Usage: \/translate \[on\|off\|status\|config\|--help\]/);
    assert.match(TRANSLATE_HELP, /without an argument.*manual translation card/is);
    assert.match(TRANSLATE_HELP, /on.*automatic display-only translation/is);
  });

  it("rejects unsupported arguments with package-local usage", () => {
    assert.deepEqual(parseTranslateCommand("later"), {
      type: "error",
      message: "Unknown /translate argument: later",
    });
    assert.match(TRANSLATE_HELP, /--help, -h/);
  });
});
