import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePithosConfig, stagePithosConfig } from "../src/pithos-config.ts";

describe(".pithos managed configuration", () => {
	it("reads the exact Pi version and managed package pins", () => {
		const parsed = parsePithosConfig(`toolchains: {}\npi:\n  version: "0.83.0"\n  extensions:\n    "@pithos-kit/echo": "npm:0.4.1"\n    third-party: "npm:1.0.0"\n`);

		assert.equal(parsed.state.piVersion, "0.83.0");
		assert.deepEqual(parsed.state.packages, { "@pithos-kit/echo": "0.4.1" });
	});

	it("creates the managed Pi mapping from an absent .pithos file", () => {
		const staged = stagePithosConfig("", {
			piVersion: "0.83.0",
			packages: { "@pithos-kit/atlas": "0.1.0" },
		});

		assert.deepEqual(parsePithosConfig(staged).state, {
			piVersion: "0.83.0",
			packages: { "@pithos-kit/atlas": "0.1.0" },
		});
	});

	it("rejects aliases, non-mapping roots, and multi-document YAML before staging", () => {
		assert.throws(
			() => parsePithosConfig("- not\n- a\n- mapping\n"),
			/must be a mapping/,
		);
		assert.throws(
			() => parsePithosConfig("shared: &settings {}\nunknown: *settings\npi: {}\n"),
			/aliases/,
		);
		assert.throws(
			() => parsePithosConfig("pi: {}\n---\npi: {}\n"),
			/exactly one YAML document/,
		);
	});

	it("updates only Pi and pithos-kit entries while preserving comments and unmanaged values", () => {
		const source = `# keep this comment\ntoolchains:\n  dotnet: custom\npi:\n  version: "0.83.0"\n  extensions:\n    third-party: "npm:1.0.0"\n    "@pithos-kit/echo": "npm:0.4.1"\nunknown: true\n`;

		const staged = stagePithosConfig(source, {
			piVersion: "0.84.1",
			packages: { "@pithos-kit/atlas": "0.1.0" },
		});

		assert.match(staged, /# keep this comment/);
		assert.match(staged, /dotnet: custom/);
		assert.match(staged, /third-party: "npm:1\.0\.0"/);
		assert.match(staged, /unknown: true/);
		assert.doesNotMatch(staged, /@pithos-kit\/echo/);
		assert.deepEqual(parsePithosConfig(staged).state, {
			piVersion: "0.84.1",
			packages: { "@pithos-kit/atlas": "0.1.0" },
		});
	});
});
