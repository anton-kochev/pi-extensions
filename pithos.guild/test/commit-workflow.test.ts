import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { buildCommitPrompt } from "../src/commit.ts";

const guildRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(guildRoot, "..");
const atlasRoot = resolve(repositoryRoot, "pithos.atlas");
const skillPath = resolve(guildRoot, "skills/conventional-commit/SKILL.md");
const guildManifestPath = resolve(guildRoot, "package.json");
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

describe("Guild Conventional Commit workflow", () => {
	it("builds /commit turns from the confirmed context-based skill", () => {
		const skill = readFileSync(skillPath, "utf8");
		const prompt = buildCommitPrompt("Guild dashboard changes");

		assert.equal(createHash("sha256").update(skill).digest("hex"), skillSha256);
		assertContextBasedStagingWorkflow(prompt);
		assertInteractiveCommitApproval(prompt);
		assert.match(prompt, /Guild dashboard changes/);
		assert.ok(prompt.startsWith(stripFrontmatter(skill).trim()));
	});

	it("makes Guild the sole package owner of /commit", () => {
		const guild = JSON.parse(readFileSync(guildManifestPath, "utf8"));
		const atlas = JSON.parse(readFileSync(atlasManifestPath, "utf8"));
		const commitCommand = guild.pithosKit.commands.find(({ name }: { name: string }) => name === "commit");
		const commitSkill = guild.pithosKit.skills.find(({ name }: { name: string }) => name === "conventional-commit");

		assert.match(commitCommand.summary, /confirm/i);
		assert.match(commitSkill.summary, /confirm/i);
		assert.ok(guild.pithosKit.commands.some(({ name }: { name: string }) => name === "skill:conventional-commit"));
		assert.ok(guild.pithosKit.tools.some(({ name }: { name: string }) => name === "create_commit"));
		assert.ok(guild.pi.skills.includes("./skills"));
		assert.equal(atlas.pithosKit.commands.some(({ name }: { name: string }) => name === "commit"), false);
		assert.equal(atlas.pithosKit.commands.some(({ name }: { name: string }) => name === "skill:conventional-commit"), false);
		assert.equal(atlas.pithosKit.tools.some(({ name }: { name: string }) => name === "create_commit"), false);
		assert.equal(atlas.pithosKit.skills.some(({ name }: { name: string }) => name === "conventional-commit"), false);
		assert.equal(existsSync(resolve(atlasRoot, "skills/conventional-commit/SKILL.md")), false);
		assert.equal(existsSync(resolve(atlasRoot, "src/commit.ts")), false);
		assert.equal(existsSync(resolve(guildRoot, "prompts/commit.md")), false);
	});

	it("has exactly one physical and metadata owner for the command, skill, and tool", () => {
		const packageRoots = readdirSync(repositoryRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && entry.name.startsWith("pithos."))
			.map((entry) => resolve(repositoryRoot, entry.name));
		const manifests = packageRoots.map((root) => ({
			root,
			manifest: JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")),
		}));
		const owners = (kind: "commands" | "tools" | "skills", name: string) => manifests
			.filter(({ manifest }) => manifest.pithosKit[kind].some((item: { name: string }) => item.name === name))
			.map(({ root }) => root);

		assert.deepEqual(owners("commands", "commit"), [guildRoot]);
		assert.deepEqual(owners("commands", "skill:conventional-commit"), [guildRoot]);
		assert.deepEqual(owners("tools", "create_commit"), [guildRoot]);
		assert.deepEqual(owners("skills", "conventional-commit"), [guildRoot]);
		assert.deepEqual(packageRoots.filter((root) => existsSync(resolve(root, "src/commit.ts"))), [guildRoot]);
		assert.deepEqual(
			packageRoots.filter((root) => existsSync(resolve(root, "skills/conventional-commit/SKILL.md"))),
			[guildRoot],
		);
	});
});
