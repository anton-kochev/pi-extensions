import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogPackage } from "../src/catalog.ts";
import { runConfigWizard } from "../src/ui.ts";

const atlas: CatalogPackage = {
	name: "@pithos-kit/atlas",
	version: "0.1.0",
	description: "Atlas",
	pithosKit: {
		displayName: "Atlas", summary: "Atlas", minimumPi: ">=0.83.0",
		commands: [{ name: "pithos", usage: "/pithos", summary: "Atlas" }],
		tools: [], prompts: [], skills: [], themes: [], agents: [], configuration: [],
	},
};

describe("Atlas configuration wizard", () => {
	it("stages a Pi update and requires an explicit default-deny diff confirmation", async () => {
		const calls: Array<{ title: string; options: string[] }> = [];
		const ui = {
			async select(title: string, options: string[]) {
				calls.push({ title, options });
				if (title === "Pi version") return options.find((option) => option.startsWith("0.84.1"));
				if (title === "Pithos packages") return "Review changes";
				if (title.startsWith("Review .pithos changes")) return "Yes";
				return undefined;
			},
			notify() {},
		};

		const result = await runConfigWizard(ui, {
			source: "toolchains: {}\npi:\n  version: \"0.83.0\"\n",
			activePiVersion: "0.83.0",
			latestPiVersion: "0.84.1",
			packages: [atlas],
			publishedVersions: {},
		});

		assert.match(result ?? "", /version: "0.84.1"/);
		const confirmation = calls.at(-1);
		assert.deepEqual(confirmation?.options, ["No", "Yes"]);
		assert.match(confirmation?.title ?? "", /^Review \.pithos changes/);
		assert.match(confirmation?.title ?? "", /-  version: "0.83.0"/);
		assert.match(confirmation?.title ?? "", /\+  version: "0.84.1"/);
	});
});
