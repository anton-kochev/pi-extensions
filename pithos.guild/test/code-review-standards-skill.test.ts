import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const guildRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(guildRoot, "..");
const skillPath = resolve(guildRoot, "skills/code-review-standards/SKILL.md");

type Capability = { name: string };
type CapabilityMetadata = { commands: Capability[]; skills: Capability[] };
type GuildManifest = {
  version: string;
  files: string[];
  pi: { skills: string[] };
  pithosKit: CapabilityMetadata;
};
type Catalog = { packages: Array<{ name: string; pithosKit: CapabilityMetadata }> };

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("Guild code-review-standards skill", () => {
  it("is a Pi-native Guild skill with command and catalog discovery metadata", () => {
    const skill = readFileSync(skillPath, "utf8");
    const guild = readJson<GuildManifest>(resolve(guildRoot, "package.json"));
    const catalog = readJson<Catalog>(resolve(repositoryRoot, "pithos.atlas/src/generated/catalog.json"));
    const catalogGuild = catalog.packages.find(({ name }) => name === "@pithos-kit/guild");

    assert.match(skill, /^---\nname: code-review-standards\ndescription: .+\n---\n/mu);
    assert.ok(guild.pi.skills.includes("./skills"));
    assert.ok(guild.files.includes("skills"));
    assert.ok(guild.pithosKit.commands.some(({ name }) => name === "skill:code-review-standards"));
    assert.ok(guild.pithosKit.skills.some(({ name }) => name === "code-review-standards"));
    assert.ok(catalogGuild);
    assert.ok(catalogGuild.pithosKit.commands.some(({ name }) => name === "skill:code-review-standards"));
    assert.ok(catalogGuild.pithosKit.skills.some(({ name }) => name === "code-review-standards"));
    assert.equal(guild.version, "0.3.0");
    assert.doesNotMatch(skill, /Grimoire|Claude|CLAUDE\.md|WebSearch|WebFetch|TaskCreate|TaskUpdate|context7/u);
  });

  it("defines focused repository-aware scope and capability detection", () => {
    const skill = readFileSync(skillPath, "utf8");

    assert.match(skill, /eligibility gate[\s\S]*code review request[\s\S]*substantive[\s\S]*(?:source|code)[\s\S]*(?:refuse|Blocked)/iu);
    assert.match(skill, /explicit (?:commit|revision)[\s\S]*range[\s\S]*git status[\s\S]*git diff[\s\S]*git diff --cached[\s\S]*untracked/iu);
    assert.match(skill, /staged[\s\S]*unstaged/iu);
    assert.match(skill, /manifest[\s\S]*lockfile[\s\S]*(?:compiler|language)[\s\S]*(?:framework|runtime)[\s\S]*supported/iu);
    assert.match(skill, /language-specific[\s\S]*only[\s\S]*detected/iu);
    assert.match(skill, /changed (?:code|scope)[\s\S]*(?:affected|connected) context/iu);
    assert.match(skill, /high-confidence[\s\S]*(?:evidence|speculative)/iu);
  });

  it("keeps severity impact-calibrated and decisions deterministic", () => {
    const skill = readFileSync(skillPath, "utf8");

    assert.match(skill, /Critical[\s\S]*directly exploitable[\s\S]*(?:irreversible|catastrophic)/u);
    assert.match(skill, /resource leak[\s\S]*race[\s\S]*logic (?:error|bug)[\s\S]*(?:not|does not)[\s\S]*(?:automatically|inherently)[\s\S]*Critical/iu);
    assert.match(skill, /Request changes[^\n]*(?:Critical|High|Medium)/u);
    assert.match(skill, /Comment[^\n]*Low[^\n]*(?:only|unresolved)/u);
    assert.match(skill, /Approve[^\n]*no actionable findings[^\n]*no material unresolved/u);
    assert.match(skill, /Blocked[\s\S]*before[\s\S]*(?:review report|findings)[\s\S]*not[\s\S]*(?:merge|review) decision/iu);
    assert.doesNotMatch(skill, /Quality Rating|Perfect code|\d(?:\.\d)?\/10/u);
  });

  it("uses the reviewer's findings-first report without claiming unrun verification", () => {
    const skill = readFileSync(skillPath, "utf8");
    const findings = skill.indexOf("### Findings");
    const summary = skill.indexOf("### Summary");

    assert.ok(findings >= 0 && summary > findings);
    assert.match(skill, /\[Severity\][^\n]*path\/to\/file\.ext:line/u);
    assert.match(skill, /Language\(s\)[\s\S]*Review Scope[\s\S]*Decision[\s\S]*Residual Risks/u);
    assert.match(skill, /never claim[\s\S]*(?:test|build|lint|type-check)[\s\S]*(?:run|passed)/iu);
    assert.match(skill, /read-only[\s\S]*(?:do not|never)[\s\S]*(?:modify|edit|create|delete)/iu);
  });

  it("documents proactive loading while leaving the reviewer self-contained when disabled", () => {
    const readme = readFileSync(resolve(guildRoot, "README.md"), "utf8");
    const notice = readFileSync(resolve(guildRoot, "NOTICE.md"), "utf8");
    const reviewer = readFileSync(resolve(guildRoot, "agents/code-reviewer.md"), "utf8");

    assert.match(readme, /code-review-standards[\s\S]*(?:installed|enabled)[\s\S]*(?:main agent|Guild child)[\s\S]*(?:proactive|automatically|model-visible)[\s\S]*(?:without|does not require)[^\n]*explicit/iu);
    assert.match(readme, /disable[\s\S]*code-reviewer[\s\S]*self-contained/iu);
    assert.match(notice, /code-review-standards[\s\S]*adapted/iu);
    assert.doesNotMatch(reviewer, /code-review-standards/u);
    assert.match(reviewer, /Hard boundary: read-only review[\s\S]*Never create, edit, or delete files/u);
    assert.match(reviewer, /Request changes[\s\S]*Comment[\s\S]*Approve/u);
    assert.match(reviewer, /### Findings[\s\S]*### Summary/u);
  });
});
