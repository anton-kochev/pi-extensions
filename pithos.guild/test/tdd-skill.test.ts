import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const guildRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(guildRoot, "..");
const atlasRoot = resolve(repositoryRoot, "pithos.atlas");
const skillPath = resolve(guildRoot, "skills/tdd/SKILL.md");
const retiredPackagePath = resolve(repositoryRoot, "pithos.skills");
const skillSha256 = "a728cd547d0c42a675ae8cc76bf3297fc2049dabcbe238c60ff439d098920cef";

function activePackageDirectories(): string[] {
  return readdirSync(repositoryRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("pithos."))
    .map((entry) => resolve(repositoryRoot, entry.name));
}

function bundlesTddSkill(packageDirectory: string): boolean {
  const skillsRoot = resolve(packageDirectory, "skills");
  if (!existsSync(skillsRoot)) return false;

  const visit = (directory: string): boolean => readdirSync(directory, { withFileTypes: true }).some((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return visit(path);
    return entry.name === "SKILL.md" && /^name:\s*tdd\s*$/mu.test(readFileSync(path, "utf8"));
  });

  return visit(skillsRoot);
}

describe("Guild TDD skill", () => {
  it("preserves the TDD workflow under Guild native skill discovery", () => {
    const skill = readFileSync(skillPath, "utf8");
    const guild = JSON.parse(readFileSync(resolve(guildRoot, "package.json"), "utf8"));

    assert.equal(createHash("sha256").update(skill).digest("hex"), skillSha256);
    assert.match(skill, /^---\nname: tdd\n/mu);
    assert.ok(guild.pi.skills.includes("./skills"));
    assert.ok(guild.pithosKit.commands.some(({ name }: { name: string }) => name === "skill:tdd"));
    assert.ok(guild.pithosKit.skills.some(({ name }: { name: string }) => name === "tdd"));
    assert.ok(guild.files.includes("skills"));
    assert.equal(existsSync(retiredPackagePath), false);
  });

  it("removes the TDD capability and bundled definition from Atlas", () => {
    const atlas = JSON.parse(readFileSync(resolve(atlasRoot, "package.json"), "utf8"));

    assert.equal(atlas.pithosKit.commands.some(({ name }: { name: string }) => name === "skill:tdd"), false);
    assert.equal(atlas.pithosKit.skills.some(({ name }: { name: string }) => name === "tdd"), false);
    assert.equal(existsSync(resolve(atlasRoot, "skills/tdd/SKILL.md")), false);
  });

  it("points active migration guidance at Guild without creating duplicate owners", () => {
    const rootReadme = readFileSync(resolve(repositoryRoot, "README.md"), "utf8");
    const planReadme = readFileSync(resolve(repositoryRoot, "pithos.plan/README.md"), "utf8");
    const cutover = readFileSync(resolve(repositoryRoot, "CUTOVER.md"), "utf8");

    assert.match(rootReadme, /TDD workflow now ships with Guild/u);
    assert.match(rootReadme, /Coordinate Guild and Atlas releases[\s\S]*Guild 0\.3\.0 owns TDD[\s\S]*Atlas 0\.6\.0/u);
    assert.match(rootReadme, /publish and verify coordinated Guild 0\.3\.0 and Atlas 0\.6\.0 releases/u);
    assert.doesNotMatch(rootReadme, /publish and verify Atlas 0\.5\.0 first/u);
    assert.match(planReadme, /Guild 0\.3\.0 for the relocated TDD skill[\s\S]*Atlas 0\.6\.0[\s\S]*no longer bundles it/u);
    assert.match(cutover, /pairs Guild 0\.3\.0 with Atlas 0\.6\.0 so Guild owns TDD[\s\S]*after Atlas stops registering them/u);
    assert.match(cutover, /TDD moved to @pithos-kit\/guild and SRS was removed/u);
  });

  it("has a single active metadata and bundled owner for the TDD skill", () => {
    const packageDirectories = activePackageDirectories();
    const metadataOwners = packageDirectories.filter((directory) => {
      const manifestPath = resolve(directory, "package.json");
      if (!existsSync(manifestPath)) return false;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      return manifest.pithosKit?.skills?.some(({ name }: { name: string }) => name === "tdd");
    });
    const bundledOwners = packageDirectories.filter(bundlesTddSkill);

    assert.deepEqual(metadataOwners, [guildRoot]);
    assert.deepEqual(bundledOwners, [guildRoot]);
  });
});
