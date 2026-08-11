import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAnswerCommandHelp } from "../extensions/command-help.ts";

describe("/answer command help", () => {
	it("recognizes --help and -h without treating them as an answer run", () => {
		for (const alias of ["--help", "-h"]) {
			const help = getAnswerCommandHelp(alias);
			assert.match(help ?? "", /Usage: \/answer/);
			assert.match(help ?? "", /--help, -h/);
		}
	});

	it("does not consume a normal invocation", () => {
		assert.equal(getAnswerCommandHelp(""), undefined);
	});
});
