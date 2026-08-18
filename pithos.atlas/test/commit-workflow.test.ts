import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { buildCommitPrompt } from "../src/commit.ts";

const atlasRoot = resolve(import.meta.dirname, "..");
const skillPath = resolve(atlasRoot, "skills/conventional-commit/SKILL.md");
const atlasManifestPath = resolve(atlasRoot, "package.json");
const skillSha256 = "359e49e229b0392788e8432d62a7c0a046115552f97578037df18f876c43c355";

function assertContextBasedStagingWorkflow(content: string): void {
	assert.match(content, /git status --short\s*\n\s*git diff\s*\n\s*git diff --cached/);
	assert.match(content, /if files are already staged, commit only staged files/i);
	assert.match(content, /current conversation[^.]*task context/i);
	assert.match(content, /if nothing is staged[^.]*scope is clear[^.]*stage/i);
	assert.match(content, /git add -- <relevant-files>/);
	assert.match(content, /if the intended files are ambiguous[^.]*ask for confirmation/i);
	assert.match(content, /do not stage unrelated untracked files, generated files[^.]*session/i);
}

function assertInteractiveCommitApproval(content: string): void {
	assert.match(content, /call\s+`create_commit`/i);
	assert.match(content, /mandatory interactive confirmation/i);
	assert.match(content, /never run\s+`git commit`\s+directly/i);
	assert.match(content, /declines?[^.]*staged changes[^.]*intact/i);
	assert.doesNotMatch(content, /git commit -m/);
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---\n[\s\S]*?\n---\n+/, "");
}

describe("Atlas Conventional Commit workflow", () => {
	it("builds /commit turns from the confirmed context-based skill", () => {
		const skill = readFileSync(skillPath, "utf8");
		const prompt = buildCommitPrompt("Guild dashboard changes");

		assert.equal(createHash("sha256").update(skill).digest("hex"), skillSha256);
		assertContextBasedStagingWorkflow(prompt);
		assertInteractiveCommitApproval(prompt);
		assert.match(prompt, /Guild dashboard changes/);
		assert.ok(prompt.startsWith(stripFrontmatter(skill).trim()));
	});

	it("makes Atlas the package owner of /commit", () => {
		const atlas = JSON.parse(readFileSync(atlasManifestPath, "utf8"));
		const commitCommand = atlas.pithosKit.commands.find(({ name }: { name: string }) => name === "commit");
		const commitSkill = atlas.pithosKit.skills.find(({ name }: { name: string }) => name === "conventional-commit");

		assert.match(commitCommand.summary, /confirm/i);
		assert.match(commitSkill.summary, /confirm/i);
		assert.ok(atlas.pithosKit.commands.some(({ name }: { name: string }) => name === "skill:conventional-commit"));
		assert.ok(atlas.pithosKit.tools.some(({ name }: { name: string }) => name === "create_commit"));
		assert.ok(atlas.pi.skills.includes("./skills"));
		assert.equal(existsSync(resolve(atlasRoot, "prompts/commit.md")), false);
	});
});
