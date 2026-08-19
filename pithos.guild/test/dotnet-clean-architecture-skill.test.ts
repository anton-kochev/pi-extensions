import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const guildRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(guildRoot, "..");
const skillRoot = resolve(guildRoot, "skills/dotnet-clean-architecture");
const skillPath = resolve(skillRoot, "SKILL.md");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function section(markdown: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = `${markdown}\n## `.match(new RegExp(`^## ${escapedHeading}\\n([\\s\\S]*?)(?=^## )`, "mu"));
  assert.ok(match, `Expected section: ${heading}`);
  return match[1];
}

type Capability = { name: string };
type CapabilityMetadata = { commands: Capability[]; skills: Capability[] };
type GuildManifest = {
  files: string[];
  pi: { skills: string[] };
  pithosKit: CapabilityMetadata;
};
type Catalog = { packages: Array<{ name: string; pithosKit: CapabilityMetadata }> };

describe("Guild dotnet-clean-architecture skill", () => {
  it("is a Pi-native Guild skill with complete discovery and attribution", () => {
    const skill = readFileSync(skillPath, "utf8");
    const guild = readJson<GuildManifest>(resolve(guildRoot, "package.json"));
    const catalog = readJson<Catalog>(resolve(repositoryRoot, "pithos.atlas/src/generated/catalog.json"));
    const catalogGuild = catalog.packages.find(({ name }) => name === "@pithos-kit/guild");
    const readme = readFileSync(resolve(guildRoot, "README.md"), "utf8");
    const notice = readFileSync(resolve(guildRoot, "NOTICE.md"), "utf8");

    assert.match(skill, /^---\nname: dotnet-clean-architecture\ndescription: [\s\S]+?\n---\n/u);
    assert.ok(guild.pi.skills.includes("./skills"));
    assert.ok(guild.files.includes("skills"));
    assert.ok(guild.pithosKit.commands.some(({ name }) => name === "skill:dotnet-clean-architecture"));
    assert.ok(guild.pithosKit.skills.some(({ name }) => name === "dotnet-clean-architecture"));
    assert.ok(catalogGuild?.pithosKit.commands.some(({ name }) => name === "skill:dotnet-clean-architecture"));
    assert.ok(catalogGuild?.pithosKit.skills.some(({ name }) => name === "dotnet-clean-architecture"));
    assert.match(readme, /dotnet-clean-architecture[\s\S]*\/skill:dotnet-clean-architecture/iu);
    assert.match(notice, /dotnet-clean-architecture[\s\S]*adapted[\s\S]*Grimoire/iu);

    const links = [...skill.matchAll(/\]\((reference\/[^)]+\.md)\)/gu)].map((match) => match[1]);
    assert.equal(new Set(links).size, 5);
    for (const link of links) assert.equal(existsSync(resolve(skillRoot, link)), true, `Missing reference: ${link}`);
  });

  it("requires repository relevance and discovers actual .NET capabilities", () => {
    const skill = readFileSync(skillPath, "utf8");
    const eligibility = section(skill, "Eligibility and repository discovery");

    assert.match(eligibility, /substantive[\s\S]*(?:\.NET|C#)[\s\S]*(?:connected|relevant)[\s\S]*(?:refuse|stop)/iu);
    for (const evidence of [".sln", ".slnx", ".csproj", "Directory.Build", "Directory.Packages", "global.json"]) {
      assert.match(eligibility, new RegExp(evidence.replaceAll(".", "\\."), "iu"));
    }
    assert.match(eligibility, /TargetFramework[\s\S]*LangVersion[\s\S]*Nullable/iu);
    assert.match(eligibility, /project references[\s\S]*package[\s\S]*(?:source|production)[\s\S]*tests/iu);
    assert.match(eligibility, /do not infer[\s\S]*(?:folder|directory) names/iu);
    assert.match(eligibility, /preserve[\s\S]*(?:healthy|working|sound)[\s\S]*(?:architecture|boundaries)[\s\S]*(?:unless|without)[\s\S]*(?:asked|authorized)/iu);
  });

  it("keeps architecture proportional instead of prescribing four projects", () => {
    const skill = readFileSync(skillPath, "utf8");
    const decision = section(skill, "Choose the smallest architecture that earns its cost");

    assert.match(decision, /domain complexity[\s\S]*(?:team|lifetime|change)[\s\S]*(?:operational|deployment)/iu);
    assert.match(decision, /CRUD[\s\S]*(?:simple layered|vertical slice)/iu);
    assert.match(decision, /hybrid/iu);
    assert.match(decision, /(?:complex|invariant)[\s\S]*(?:simple|direct)|(?:simple|direct)[\s\S]*(?:complex|invariant)/iu);
    assert.match(decision, /four[- ]project[\s\S]*(?:example|option|starting point)[\s\S]*(?:not|never)[\s\S]*(?:requirement|default|mandate)/iu);
    assert.match(skill, /material[\s\S]*(?:migration|compatibility|product)[\s\S]*(?:Blocked|authorization|approval)/u);
  });

  it("defines inward dependencies and layer responsibilities without cargo cult", () => {
    const skill = readFileSync(skillPath, "utf8");
    const rule = section(skill, "Dependency rule and responsibilities");

    assert.match(rule, /dependenc(?:y|ies)[\s\S]*(?:point|flow)[\s\S]*inward/iu);
    assert.match(rule, /Domain[\s\S]*(?:invariant|business polic)[\s\S]*(?:Application|use case)[\s\S]*(?:orchestrat|coordinate)/u);
    assert.match(rule, /Infrastructure[\s\S]*(?:adapter|persistence|external)[\s\S]*(?:Presentation|transport|endpoint)/u);
    assert.match(rule, /port[\s\S]*(?:consumer|needs it|owned by)[\s\S]*(?:interface|abstraction)[\s\S]*(?:real boundary|substitution|isolation)/iu);
    assert.match(rule, /composition root[\s\S]*(?:repository|existing|detected)/iu);
    assert.match(rule, /interface[\s\S]*(?:every|each)[\s\S]*(?:avoid|do not|not)/iu);
  });

  it("preserves domain invariants and makes event consistency explicit", () => {
    const skill = readFileSync(skillPath, "utf8");
    const domain = section(skill, "Domain and application behavior");

    assert.match(domain, /invariant[\s\S]*(?:entity|aggregate)[\s\S]*(?:method|owner)/iu);
    assert.match(domain, /value object[\s\S]*(?:identity|equality|validation)/iu);
    assert.match(domain, /collection[\s\S]*(?:encapsulat|read-only)[\s\S]*(?:mutation|method)/iu);
    assert.match(domain, /expected[\s\S]*(?:failure|outcome)[\s\S]*(?:result|error)[\s\S]*exception/iu);
    assert.match(domain, /domain event[\s\S]*(?:delivery|ordering)[\s\S]*idempoten[\s\S]*(?:transaction|outbox)/iu);
    assert.match(domain, /handler[\s\S]*(?:orchestrat|coordinate)[\s\S]*(?:business rule|invariant)[\s\S]*(?:domain|owner)/iu);
  });

  it("conditions persistence, libraries, and tests on repository evidence", () => {
    const skill = readFileSync(skillPath, "utf8");
    const boundaries = section(skill, "Persistence and external boundaries");
    const testing = section(skill, "Test-first architecture and verification");

    assert.match(boundaries, /EF Core[\s\S]*(?:when|if)[\s\S]*(?:detected|present|uses)/iu);
    assert.match(boundaries, /provider[\s\S]*version[\s\S]*(?:migration|transaction)[\s\S]*concurrenc/iu);
    assert.match(boundaries, /DbContext[\s\S]*data-access/iu);
    assert.match(boundaries, /generic repositor[\s\S]*(?:real boundary|aggregate access need|domain[\s\S]*question)/iu);
    assert.match(boundaries, /IQueryable[\s\S]*(?:boundary|layer)[\s\S]*(?:material|DTO|page)/iu);
    assert.match(boundaries, /authorization/iu);
    assert.match(boundaries, /(?:secret|sensitive)/iu);
    assert.match(boundaries, /(?:retry|timeout|cancellation)/iu);

    assert.match(testing, /repository[\s\S]*(?:test framework|test runner|test command)/iu);
    assert.match(testing, /red[\s-]*green[\s-]*refactor/iu);
    assert.match(testing, /existing architecture-test tool|architecture[\s\S]*already enforce/iu);
    assert.match(testing, /(?:package|dependency)[\s\S]*(?:approved|authorize)/iu);
    assert.match(testing, /domain[\s\S]*unit[\s\S]*(?:application|use-case)[\s\S]*(?:integration|contract)[\s\S]*(?:architecture|dependency)/iu);
    assert.match(testing, /never\s+claim[\s\S]*(?:test|build|verification)[\s\S]*(?:pass|success)[\s\S]*(?:unless|without)[\s\S]*(?:run|execut)/iu);
  });

  it("preserves architect and coder boundaries and avoids time-sensitive assumptions", () => {
    const files = [
      skillPath,
      resolve(skillRoot, "reference/solution-structure.md"),
      resolve(skillRoot, "reference/domain-layer.md"),
      resolve(skillRoot, "reference/application-layer.md"),
      resolve(skillRoot, "reference/infrastructure-and-presentation.md"),
      resolve(skillRoot, "reference/testing-and-antipatterns.md"),
    ];
    const combined = files.map((path) => readFileSync(path, "utf8")).join("\n");
    const skill = readFileSync(skillPath, "utf8");

    assert.match(skill, /architect[\s\S]*read-only[\s\S]*(?:contracts|handoff)[\s\S]*coder[\s\S]*(?:implement|edit)[\s\S]*(?:test|verify)/iu);
    assert.doesNotMatch(combined, /Grimoire|Claude|CLAUDE\.md|WebSearch|WebFetch|TaskCreate|TaskUpdate|context7/u);
    assert.doesNotMatch(combined, /(?:\.NET|C#)\s+\d+(?:\.\d+)?/u);
    assert.doesNotMatch(combined, /current\s*:\s*\.NET|current \(20\d{2}\)|commercial since|unmaintained since/iu);
    assert.match(combined, /(?:MediatR|mediator)[\s\S]*(?:detected|existing|license|compatib)/iu);
    assert.match(combined, /examples?[\s\S]*(?:adapt|illustrative|supported)[\s\S]*(?:language|framework|repository)/iu);
  });
});
