import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveActivePiVersion } from "../src/active-pi.ts";

describe("active Pi version detection", () => {
	it("reads the running Pi package instead of Atlas's local development dependency", () => {
		const root = mkdtempSync(join(tmpdir(), "atlas-active-pi-"));
		try {
			mkdirSync(join(root, "dist"));
			writeFileSync(join(root, "dist", "cli.js"), "");
			writeFileSync(join(root, "package.json"), JSON.stringify({
				name: "@earendil-works/pi-coding-agent",
				version: "0.84.1",
			}));

			assert.equal(resolveActivePiVersion({
				entrypoint: join(root, "dist", "cli.js"),
				fallbackVersion: "0.83.0",
			}), "0.84.1");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
