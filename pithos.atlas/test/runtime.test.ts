import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import type { CatalogPackage } from "../src/catalog.ts";
import { observeRuntime } from "../src/runtime.ts";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

const echo: CatalogPackage = {
	name: "@pithos-kit/echo",
	version: "0.4.1",
	description: "Echo",
	pithosKit: {
		displayName: "Echo", summary: "Echo", minimumPi: ">=0.83.0",
		commands: [{ name: "ask", usage: "/ask", summary: "Ask" }],
		tools: [], prompts: [], skills: [], themes: [], agents: [], configuration: [],
	},
};

describe("Atlas runtime observation", () => {
	it("uses source provenance and a matching package manifest as loaded-version evidence", async () => {
		const directory = await mkdtemp(join(tmpdir(), "atlas-runtime-"));
		temporaryDirectories.push(directory);
		await mkdir(join(directory, "extensions"));
		await writeFile(join(directory, "package.json"), JSON.stringify({ name: "@pithos-kit/echo", version: "0.4.1" }));
		const sourceInfo = {
			source: "npm:@pithos-kit/echo",
			path: join(directory, "extensions", "index.ts"),
			baseDir: directory,
			scope: "project" as const,
			origin: "package" as const,
		};

		const result = await observeRuntime(
			[echo],
			[{ name: "ask", source: "extension", sourceInfo }],
			[{ name: "echo_tool", sourceInfo }],
		);

		assert.deepEqual(result, [{
			name: "@pithos-kit/echo",
			version: "0.4.1",
			commands: ["ask"],
			tools: ["echo_tool"],
		}]);
	});
});
