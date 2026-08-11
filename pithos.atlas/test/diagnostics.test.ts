import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogPackage } from "../src/catalog.ts";
import { buildDiagnostics } from "../src/diagnostics.ts";

function pkg(name: string, version: string, minimumPi: string): CatalogPackage {
	return {
		name: `@pithos-kit/${name}`,
		version,
		description: name,
		pithosKit: {
			displayName: name,
			summary: name,
			minimumPi,
			commands: [{ name, usage: `/${name}`, summary: name }],
			tools: [], prompts: [], skills: [], themes: [], agents: [], configuration: [],
		},
	};
}

describe("Atlas diagnostics", () => {
	it("does not report inactive bundled packages as active-Pi compatibility problems", () => {
		const report = buildDiagnostics({
			activePiVersion: "0.83.0",
			bundled: [pkg("context-bar", "0.1.0", ">=0.84.1")],
			publishedVersions: {},
			configuredPackages: {},
			runtimePackages: [],
		});

		assert.equal(report.packages[0]?.compatibleWithActivePi, undefined);
		assert.equal(report.packages[0]?.compatibleWithConfiguredPi, undefined);
	});

	it("evaluates loaded and configured package versions independently", () => {
		const configured = pkg("example", "1.0.0", ">=0.84.0");
		const loaded = pkg("example", "2.0.0", ">=0.90.0");
		const report = buildDiagnostics({
			activePiVersion: "0.90.0",
			configuredPiVersion: "0.84.0",
			bundled: [configured],
			publishedVersions: { "@pithos-kit/example": [loaded, configured] },
			configuredPackages: { "@pithos-kit/example": "1.0.0" },
			runtimePackages: [{ name: "@pithos-kit/example", version: "2.0.0" }],
		});

		assert.equal(report.packages[0]?.compatibleWithActivePi, true);
		assert.equal(report.packages[0]?.compatibleWithConfiguredPi, true);
	});

	it("keeps active, configured, latest, and compatible package versions distinct", () => {
		const bundled = pkg("context-bar", "0.1.0", ">=0.84.1");
		const latest = pkg("context-bar", "0.2.0", ">=0.90.0");
		const report = buildDiagnostics({
			activePiVersion: "0.83.0",
			configuredPiVersion: "0.84.1",
			bundled: [bundled],
			publishedVersions: { "@pithos-kit/context-bar": [latest, bundled] },
			configuredPackages: { "@pithos-kit/context-bar": "0.1.0" },
			runtimePackages: [{ name: "@pithos-kit/context-bar", version: "0.1.0" }],
		});

		assert.equal(report.activePiVersion, "0.83.0");
		assert.equal(report.configuredPiVersion, "0.84.1");
		assert.deepEqual(report.packages[0], {
			name: "@pithos-kit/context-bar",
			bundledVersion: "0.1.0",
			configuredVersion: "0.1.0",
			loadedVersion: "0.1.0",
			latestVersion: "0.2.0",
			recommendedVersion: "0.1.0",
			compatibleWithActivePi: false,
			compatibleWithConfiguredPi: true,
		});
	});
});
