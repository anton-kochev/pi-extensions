import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAtlasCommand } from "../src/atlas.ts";

describe("Atlas command", () => {
	it("parses the single help page and supported top-level actions", () => {
		assert.deepEqual(parseAtlasCommand(""), { action: "menu" });
		assert.deepEqual(parseAtlasCommand("help"), { action: "help" });
		assert.deepEqual(parseAtlasCommand("packages"), { action: "packages" });
		assert.deepEqual(parseAtlasCommand("versions --refresh"), { action: "versions", refresh: true });
		assert.deepEqual(parseAtlasCommand("doctor"), { action: "doctor", refresh: false });
		assert.deepEqual(parseAtlasCommand("config"), { action: "config" });
		assert.deepEqual(parseAtlasCommand("config validate"), { action: "config-validate" });
		assert.throws(() => parseAtlasCommand("help ask"), /Usage: \/pithos/);
	});
});
