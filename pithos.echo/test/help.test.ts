import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getEchoCommandHelp } from "../src/command-help.ts";

describe("Echo command help", () => {
	for (const [command, usage] of [
		["ask", "Usage: /ask [options] [--] question"],
		["ask-clear", "Usage: /ask-clear"],
		["asked", "Usage: /asked"],
	] as const) {
		it(`recognizes --help and -h for /${command}`, () => {
			for (const alias of ["--help", "-h"]) {
				const help = getEchoCommandHelp(command, alias);
				assert.match(help ?? "", new RegExp(usage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
				assert.match(help ?? "", /--help, -h/);
			}
		});
	}

	it("does not consume normal command arguments", () => {
		assert.equal(getEchoCommandHelp("ask", "what changed?"), undefined);
		assert.equal(getEchoCommandHelp("ask-clear", ""), undefined);
		assert.equal(getEchoCommandHelp("asked", ""), undefined);
	});
});
