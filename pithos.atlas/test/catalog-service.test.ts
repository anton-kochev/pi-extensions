import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Catalog } from "../src/catalog.ts";
import { refreshCatalog } from "../src/catalog-service.ts";
import { RegistryClient } from "../src/registry.ts";

const bundled: Catalog = {
	schemaVersion: 1,
	packages: [{
		name: "@pithos-kit/example",
		version: "1.0.0",
		description: "Example",
		pithosKit: {
			displayName: "Example",
			summary: "Example",
			minimumPi: ">=0.83.0",
			commands: [{ name: "example", usage: "/example", summary: "Example" }],
			tools: [], prompts: [], skills: [], themes: [], agents: [], configuration: [],
		},
	}],
};

describe("Atlas catalog refresh", () => {
	it("refreshes independent package metadata concurrently", async () => {
		let active = 0;
		let maximumActive = 0;
		const registry = {
			async discover() { return ["@pithos-kit/alpha", "@pithos-kit/zebra"]; },
			async latest(name: string) {
				active += 1;
				maximumActive = Math.max(maximumActive, active);
				await new Promise((resolve) => setTimeout(resolve, 5));
				active -= 1;
				return { ...bundled.packages[0], name };
			},
			async latestPiVersion() { return "0.90.0"; },
		};

		const result = await refreshCatalog(bundled, registry as never);

		assert.equal(maximumActive, 3);
		assert.deepEqual(result.packages.map(({ name }) => name), [
			"@pithos-kit/alpha",
			"@pithos-kit/example",
			"@pithos-kit/zebra",
		]);
	});

	it("does not rediscover retired packages from npm search", async () => {
		const requested: string[] = [];
		const registry = {
			async discover() { return ["@pithos-kit/active", "@pithos-kit/skills"]; },
			async latest(name: string) {
				requested.push(name);
				return { ...bundled.packages[0], name };
			},
			async latestPiVersion() { return "0.90.0"; },
		};

		const result = await refreshCatalog(bundled, registry as never);

		assert.deepEqual(requested.sort(), ["@pithos-kit/active", "@pithos-kit/example"]);
		assert.deepEqual(result.packages.map(({ name }) => name), [
			"@pithos-kit/active",
			"@pithos-kit/example",
		]);
		assert.equal(result.publishedVersions["@pithos-kit/skills"], undefined);
	});

	it("returns the bundled catalog with warnings when the registry is unavailable", async () => {
		const registry = new RegistryClient({
			fetch: async () => new Response("unavailable", { status: 503 }),
		});

		const result = await refreshCatalog(bundled, registry);

		assert.deepEqual(result.packages, bundled.packages);
		assert.deepEqual(result.publishedVersions, {});
		assert.equal(result.warnings.length > 0, true);
	});
});
