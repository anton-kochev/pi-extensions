import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogPackage } from "../src/catalog.ts";
import { parsePithosConfig } from "../src/pithos-config.ts";
import { runConfigWizard } from "../src/ui.ts";

function catalogPackage(shortName: string, displayName: string, version: string, minimumPi = ">=0.83.0"): CatalogPackage {
	return {
		name: `@pithos-kit/${shortName}`,
		version,
		description: displayName,
		pithosKit: {
			displayName, summary: displayName, minimumPi,
			commands: [], tools: [], prompts: [], skills: [], themes: [], agents: [], configuration: [],
		},
	};
}

const atlas = catalogPackage("atlas", "Atlas", "0.1.0");
const answer = catalogPackage("answer", "Answer", "0.2.0");

async function listPackageOptions(input: Parameters<typeof runConfigWizard>[1]): Promise<string[]> {
	let packageOptions: string[] = [];
	await runConfigWizard({
		async select(title, options) {
			if (title === "Configure 1/3 · Pi version") return options[0];
			if (title === "Configure 2/3 · Toolchains") return "Continue";
			if (title === "Configure 3/3 · pithos-kit packages") {
				packageOptions = options;
				return undefined;
			}
			return undefined;
		},
		async input() { return undefined; },
		notify() {},
	}, input);
	return packageOptions;
}

describe("Atlas configuration wizard", () => {
	it("configures exact toolchain versions in a dedicated selector", async () => {
		let toolchainMenuCount = 0;
		let initialToolchainOptions: string[] = [];
		let changedToolchainOptions: string[] = [];
		const result = await runConfigWizard({
			async select(title, options) {
				if (title === "Configure 1/3 · Pi version") return options[0];
				if (title === "Configure 2/3 · Toolchains") {
					toolchainMenuCount += 1;
					if (toolchainMenuCount === 1) {
						initialToolchainOptions = options;
						return options.find((option) => option.startsWith("◇ Go"));
					}
					changedToolchainOptions = options;
					return "Continue";
				}
				if (title === "Configure 3/3 · pithos-kit packages") return "Review and Submit";
				if (title.startsWith("Review .pithos changes")) return "Yes";
				return undefined;
			},
			async input(title) {
				assert.equal(title, "Go version");
				return "1.24.0";
			},
			notify() {},
		}, {
			source: "toolchains:\n  dotnet: \"10.0\"\npi:\n  version: \"0.83.0\"\n",
			activePiVersion: "0.83.0",
			packages: [],
			publishedVersions: {},
		});

		assert.deepEqual(initialToolchainOptions, [
			"Continue",
			"◆ .NET · 10.0",
			"◇ Go",
			"◇ Rust",
		]);
		assert.ok(changedToolchainOptions.includes("◈ Go · 1.24.0"));
		assert.deepEqual(parsePithosConfig(result ?? "").state.toolchains, { dotnet: "10.0", go: "1.24.0" });
	});

	it("shows configured and available packages together with truthful version labels", async () => {
		const packageOptions = await listPackageOptions({
			source: "pi:\n  version: \"0.83.0\"\n  extensions:\n    \"@pithos-kit/atlas\": npm:0.1.0\n",
			activePiVersion: "0.83.0",
			packages: [atlas, answer],
			publishedVersions: {
				"@pithos-kit/answer": [answer],
				"@pithos-kit/atlas": [atlas],
			},
		});

		assert.deepEqual(packageOptions, [
			"Review and Submit",
			"◇ Answer · 0.2.0",
			"◆ Atlas · 0.1.0",
		]);
	});

	it("marks a newly selected package as changed until submission", async () => {
		let packageMenuCount = 0;
		let changedPackageOptions: string[] = [];
		await runConfigWizard({
			async select(title, options) {
				if (title === "Configure 1/3 · Pi version") return options[0];
				if (title === "Configure 2/3 · Toolchains") return "Continue";
				if (title === "Configure 3/3 · pithos-kit packages") {
					packageMenuCount += 1;
					if (packageMenuCount === 1) return options.find((option) => option.startsWith("◇ Atlas"));
					changedPackageOptions = options;
					return undefined;
				}
				if (title === "Atlas version") return "0.1.0";
				return undefined;
			},
			async input() { return undefined; },
			notify() {},
		}, {
			source: "pi:\n  version: \"0.83.0\"\n",
			activePiVersion: "0.83.0",
			packages: [atlas],
			publishedVersions: { "@pithos-kit/atlas": [atlas] },
		});

		assert.ok(changedPackageOptions.includes("◈ Atlas · 0.1.0"));
	});

	it("shows a newer published version beside the configured version", async () => {
		const latestAtlas = catalogPackage("atlas", "Atlas", "0.2.0");
		const packageOptions = await listPackageOptions({
			source: "pi:\n  version: \"0.83.0\"\n  extensions:\n    \"@pithos-kit/atlas\": npm:0.1.0\n",
			activePiVersion: "0.83.0",
			packages: [latestAtlas],
			publishedVersions: { "@pithos-kit/atlas": [latestAtlas, atlas] },
		});

		assert.ok(packageOptions.includes("◆ Atlas · 0.1.0 ↑ 0.2.0"));
	});

	it("marks a latest version that is incompatible with the selected Pi", async () => {
		const contextBar = catalogPackage("context-bar", "Context Bar", "0.1.0", ">=0.84.1");
		const packageOptions = await listPackageOptions({
			source: "pi:\n  version: \"0.83.0\"\n",
			activePiVersion: "0.83.0",
			latestPiVersion: "0.84.1",
			packages: [contextBar],
			publishedVersions: { "@pithos-kit/context-bar": [contextBar] },
		});

		assert.ok(packageOptions.includes("◇ Context Bar · 0.1.0 · requires Pi >=0.84.1"));
	});

	it("marks a configured version that is incompatible with the selected Pi", async () => {
		const contextBar = catalogPackage("context-bar", "Context Bar", "0.1.0", ">=0.84.1");
		const packageOptions = await listPackageOptions({
			source: "pi:\n  version: \"0.83.0\"\n  extensions:\n    \"@pithos-kit/context-bar\": npm:0.1.0\n",
			activePiVersion: "0.83.0",
			packages: [contextBar],
			publishedVersions: { "@pithos-kit/context-bar": [contextBar] },
		});

		assert.ok(packageOptions.includes("◆ Context Bar · 0.1.0 · requires Pi >=0.84.1"));
	});

	it("keeps a configured package visible when catalog metadata is unavailable", async () => {
		const packageOptions = await listPackageOptions({
			source: "pi:\n  version: \"0.83.0\"\n  extensions:\n    \"@pithos-kit/custom\": npm:1.2.3\n",
			activePiVersion: "0.83.0",
			packages: [atlas],
			publishedVersions: {},
		});

		assert.ok(packageOptions.includes("◆ @pithos-kit/custom · 1.2.3 · latest unavailable"));
	});

	it("stages a Pi update and requires an explicit default-deny diff confirmation", async () => {
		const calls: Array<{ title: string; options: string[] }> = [];
		const ui = {
			async select(title: string, options: string[]) {
				calls.push({ title, options });
				if (title === "Configure 1/3 · Pi version") return options.find((option) => option.startsWith("0.84.1"));
				if (title === "Configure 2/3 · Toolchains") return "Continue";
				if (title === "Configure 3/3 · pithos-kit packages") return "Review and Submit";
				if (title.startsWith("Review .pithos changes")) return "Yes";
				return undefined;
			},
			async input() { return undefined; },
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
