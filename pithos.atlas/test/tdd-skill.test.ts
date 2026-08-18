import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const atlasRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(atlasRoot, "..");
const skillPath = resolve(atlasRoot, "skills/tdd/SKILL.md");
const retiredPackagePath = resolve(repositoryRoot, "pithos.skills");
const skillSha256 = "a728cd547d0c42a675ae8cc76bf3297fc2049dabcbe238c60ff439d098920cef";

function activePackageDirectories(): string[] {
	return readdirSync(repositoryRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name.startsWith("pithos."))
		.map((entry) => resolve(repositoryRoot, entry.name));
}

describe("Atlas TDD skill", () => {
	it("preserves the retired package's TDD workflow under Atlas", () => {
		const skill = readFileSync(skillPath, "utf8");
		const atlas = JSON.parse(readFileSync(resolve(atlasRoot, "package.json"), "utf8"));

		assert.equal(createHash("sha256").update(skill).digest("hex"), skillSha256);
		assert.match(skill, /^---\nname: tdd\n/mu);
		assert.ok(atlas.pi.skills.includes("./skills"));
		assert.ok(atlas.pithosKit.commands.some(({ name }: { name: string }) => name === "skill:tdd"));
		assert.ok(atlas.pithosKit.skills.some(({ name }: { name: string }) => name === "tdd"));
		assert.equal(existsSync(retiredPackagePath), false);
	});

	it("relies on native skill discovery without a hidden TDD input handler", () => {
		const atlasSource = readFileSync(resolve(atlasRoot, "src/atlas.ts"), "utf8");

		assert.equal(existsSync(resolve(atlasRoot, "src/tdd.ts")), false);
		assert.doesNotMatch(atlasSource, /registerTddHelp|\.\/tdd\.ts/u);
	});

	it("has a single active package owner for the tdd skill", () => {
		const owners = activePackageDirectories().filter((directory) => {
			const manifestPath = resolve(directory, "package.json");
			if (!existsSync(manifestPath)) return false;
			const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
			return manifest.pithosKit?.skills?.some(({ name }: { name: string }) => name === "tdd");
		});

		assert.deepEqual(owners, [atlasRoot]);
	});
});
