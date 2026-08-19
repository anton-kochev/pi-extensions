import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  GUILD_MEMBER_NAMES,
  GUILD_MEMBER_POLICIES,
  discoverGuildMembers,
  findNearestProjectAgentsDir,
} from "../src/agents";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "pi-guild-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeAgent(
  directory: string,
  name: string,
  description = `${name} description`,
  tools = GUILD_MEMBER_POLICIES[name as keyof typeof GUILD_MEMBER_POLICIES]?.tools ?? ["read"],
  body = `System prompt for ${name}.`,
): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${name}.md`),
    `---\nname: ${name}\ndescription: ${description}\ntools: ${tools.join(", ")}\n---\n\n${body}\n`,
  );
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("Guild member policies", () => {
  it("defines the approved narrow roster and hard role tool boundaries", () => {
    assert.deepEqual(GUILD_MEMBER_NAMES, [
      "dotnet-architect",
      "frontend-architect",
      "csharp-coder",
      "angular-coder",
    ]);
    assert.deepEqual(GUILD_MEMBER_POLICIES["dotnet-architect"].tools, ["read", "grep", "find", "ls"]);
    assert.deepEqual(GUILD_MEMBER_POLICIES["frontend-architect"].tools, ["read", "grep", "find", "ls"]);
    assert.deepEqual(GUILD_MEMBER_POLICIES["csharp-coder"].tools, ["read", "grep", "find", "ls", "edit", "write", "bash"]);
    assert.deepEqual(GUILD_MEMBER_POLICIES["angular-coder"].tools, ["read", "grep", "find", "ls", "edit", "write", "bash"]);
  });

  it("ships one valid built-in definition for every approved Guild member", () => {
    const builtInDir = resolve(import.meta.dirname, "../agents");
    const result = discoverGuildMembers({ builtInDir });

    assert.deepEqual(result.members.map((agent) => agent.name), GUILD_MEMBER_NAMES);
    assert.ok(result.members.every((agent) => agent.source === "builtin"));
    assert.deepEqual(result.warnings, []);
  });

  it("keeps the .NET architect read-only, repository-aware, and at architecture altitude", () => {
    const builtInDir = resolve(import.meta.dirname, "../agents");
    const member = discoverGuildMembers({ builtInDir }).members.find(({ name }) => name === "dotnet-architect");

    assert.ok(member);
    assert.deepEqual(member.tools, ["read", "grep", "find", "ls"]);
    const prompt = member.systemPrompt;
    assert.match(prompt, /read-only[\s\S]*Never create, edit, or delete files, run shell commands/i);
    assert.match(prompt, /eligibility gate[\s\S]*verify[\s\S]*(?:\.sln|\.csproj)[\s\S]*refuse/i);
    assert.match(prompt, /refuse[\s\S]{0,240}(?:outside|does not belong to)[\s\S]{0,120}\.NET/i);
    assert.match(prompt, /refuse[\s\S]{0,300}repository[\s\S]{0,200}(?:no relevant|does not contain)[\s\S]{0,120}(?:\.NET|C#)/i);
    assert.match(prompt, /explain[\s\S]{0,120}(?:why|reason|evidence)/i);
    assert.match(prompt, /architecture altitude[\s\S]*contract snippet declares members; it does not implement them/i);
    assert.match(prompt, /Read before designing[\s\S]*target frameworks[\s\S]*language and package versions/i);
    assert.match(prompt, /Apply principles as tools, not rituals/i);
    assert.match(prompt, /Clean Architecture[\s\S]*Domain-Driven Design/i);
    assert.match(prompt, /red-green-refactor/i);
    assert.match(prompt, /nullable annotations[^\n]*(?:supported|enabled|configuration|settings)/i);
    assert.match(prompt, /Entity Framework Core/i);
    assert.match(prompt, /Azure Functions/i);
    assert.match(prompt, /Failure, security, and operations[\s\S]*Performance/i);
    assert.match(prompt, /Quality checklist/i);
    assert.match(prompt, /Test Plan[\s\S]*Handoff[\s\S]*(?:affected paths or areas)[\s\S]*implementation order[\s\S]*acceptance criteria[\s\S]*constraints/i);
    assert.match(prompt, /Never[\s\S]{0,100}claim(?:ed)? to have implemented/i);
    assert.doesNotMatch(prompt, /csharp-coder/i);
    assert.doesNotMatch(prompt, /grimoire\.dotnet-architect|CLAUDE\.md|\bBash\b|\bSkill\b/i);
    assert.doesNotMatch(prompt, /(?:\.NET|C#)\s*(?:8|9|10|11|12)(?:\+|\.0|\s+or\s+(?:later|newer)|\s+and\s+(?:later|newer))/i);
  });

  it("keeps the front-end architect read-only, framework-aware, and at architecture altitude", () => {
    const builtInDir = resolve(import.meta.dirname, "../agents");
    const member = discoverGuildMembers({ builtInDir }).members.find(({ name }) => name === "frontend-architect");

    assert.ok(member);
    assert.deepEqual(member.tools, ["read", "grep", "find", "ls"]);
    const prompt = member.systemPrompt;
    assert.match(prompt, /read-only[\s\S]*Never create, edit, or delete files, run shell commands/i);
    assert.match(prompt, /architecture altitude[\s\S]*contract snippet declares members; it does not implement them/i);
    assert.match(prompt, /package manifests[\s\S]*lockfiles[\s\S]*framework[\s\S]*version/i);
    assert.match(prompt, /component[\s\S]*state ownership[\s\S]*data flow[\s\S]*routing[\s\S]*rendering/i);
    assert.match(prompt, /server state[\s\S]*client state/i);
    assert.match(prompt, /Angular[\s\S]*Vue/i);
    assert.match(prompt, /version-sensitive[\s\S]*(?:verify|evidence|repository)/i);
    assert.match(prompt, /accessibility[\s\S]*performance/i);
    assert.match(prompt, /loading, empty, and error states/i);
    assert.match(prompt, /red-green-refactor/i);
    assert.match(prompt, /Apply principles as tools, not rituals/i);
    assert.match(prompt, /Project best practice[\s\S]*Local convention[\s\S]*Questionable pattern[\s\S]*Anti-pattern/i);
    assert.match(prompt, /repository conventions and explicit user direction[\s\S]{0,240}(?:constraints|follow)[\s\S]{0,240}correctness[\s\S]{0,160}security[\s\S]{0,160}accessibility/i);
    assert.match(prompt, /When either conflicts[\s\S]{0,240}explain[\s\S]{0,160}smallest safer alternative/i);
    assert.match(prompt, /Test Plan[\s\S]*Handoff[\s\S]*(?:affected paths or areas)[\s\S]*implementation order[\s\S]*acceptance criteria[\s\S]*constraints/i);
    assert.match(prompt, /Quality checklist/i);
    assert.doesNotMatch(prompt, /angular-coder|vue-coder/i);
    assert.doesNotMatch(prompt, /grimoire\.frontend-architect|CLAUDE\.md|\bBash\b|\bSkill\b|WebSearch|WebFetch|context7/i);
  });

  it("keeps the C# coder repository-aware, test-driven, and implementation-focused", () => {
    const builtInDir = resolve(import.meta.dirname, "../agents");
    const member = discoverGuildMembers({ builtInDir }).members.find(({ name }) => name === "csharp-coder");

    assert.ok(member);
    assert.deepEqual(member.tools, ["read", "grep", "find", "ls", "edit", "write", "bash"]);
    const prompt = member.systemPrompt;
    assert.match(prompt, /eligibility gate[\s\S]*C#[\s\S]*(?:\.sln|\.csproj)[\s\S]*refuse/i);
    assert.match(prompt, /refuse[\s\S]{0,300}(?:outside|does not belong to)[\s\S]{0,120}(?:C#|\.NET)/i);
    assert.match(prompt, /refuse[\s\S]{0,360}repository[\s\S]{0,220}(?:no relevant|does not contain)[\s\S]{0,120}(?:C#|\.NET)/i);
    assert.match(prompt, /edit[^\n]*write[^\n]*file changes[\s\S]*bash[^\n]*(?:build|test|verification)/i);
    assert.match(prompt, /target frameworks[\s\S]*language version[\s\S]*nullable/i);
    assert.match(prompt, /repository-supported[\s\S]*(?:language|framework) features/i);
    assert.match(prompt, /red-green-refactor/i);
    assert.match(prompt, /CancellationToken[\s\S]*\.Result[\s\S]*\.Wait\(\)/i);
    assert.match(prompt, /repository conventions and explicit user direction[\s\S]{0,260}(?:constraints|follow)[\s\S]{0,260}correctness[\s\S]{0,180}security[\s\S]{0,180}maintainability/i);
    assert.match(prompt, /conflicts[\s\S]{0,300}(?:explain|document)[\s\S]{0,180}smallest safer alternative/i);
    assert.match(prompt, /Never report success[\s\S]{0,220}(?:compilation|tests)[\s\S]{0,220}(?:fail|blocked)/i);
    assert.match(prompt, /Status[\s\S]*Summary[\s\S]*Files Changed[\s\S]*Verification/i);
    assert.doesNotMatch(prompt, /grimoire\.csharp-coder|CLAUDE\.md|\bSkill\b|WebSearch|WebFetch|context7|TaskCreate|TaskUpdate|TaskList|TaskOutput|TaskStop/i);
    assert.doesNotMatch(prompt, /(?:\.NET|C#)\s*(?:8|9|10|11|12|13)(?:\+|\.0|\s+or\s+(?:later|newer)|\s+and\s+(?:later|newer))/i);
    assert.doesNotMatch(prompt, /No primary constructors/i);
  });

  it("keeps the Angular coder repository-aware, version-aware, and implementation-focused", () => {
    const builtInDir = resolve(import.meta.dirname, "../agents");
    const member = discoverGuildMembers({ builtInDir }).members.find(({ name }) => name === "angular-coder");

    assert.ok(member);
    assert.deepEqual(member.tools, ["read", "grep", "find", "ls", "edit", "write", "bash"]);
    const prompt = member.systemPrompt;
    assert.match(prompt, /eligibility gate[\s\S]*Angular[\s\S]*(?:angular\.json|@angular\/core)[\s\S]*refuse/i);
    assert.match(prompt, /refuse[\s\S]{0,300}(?:outside|does not belong to)[\s\S]{0,120}Angular/i);
    assert.match(prompt, /refuse[\s\S]{0,360}repository[\s\S]{0,220}(?:no relevant|does not contain)[\s\S]{0,120}Angular/i);
    assert.match(prompt, /edit[^\n]*write[^\n]*file changes[\s\S]*bash[^\n]*(?:build|test|verification)/i);
    assert.match(prompt, /Angular[\s\S]*TypeScript[\s\S]*RxJS[\s\S]*(?:versions|version)/i);
    assert.match(prompt, /repository-supported[\s\S]*(?:Angular|framework)[\s\S]*(?:APIs|features)/i);
    assert.match(prompt, /red-green-refactor/i);
    assert.match(prompt, /latest Angular-recommended[\s\S]{0,240}(?:default|prefer)[\s\S]{0,180}new code/i);
    assert.match(prompt, /standalone[\s\S]*OnPush[\s\S]*(?:built-in|modern) (?:template )?control flow[\s\S]*signal-based[\s\S]*inject\(\)[\s\S]*functional/i);
    assert.match(prompt, /repository version[\s\S]{0,220}(?:does not support|unsupported)[\s\S]{0,220}(?:compatible|upgrade)/i);
    assert.match(prompt, /RxJS[\s\S]*nested subscriptions[\s\S]*takeUntilDestroyed/i);
    assert.match(prompt, /typed reactive forms/i);
    assert.match(prompt, /semantic HTML[\s\S]*keyboard[\s\S]*focus[\s\S]*(?:announcements|screen reader)/i);
    assert.match(prompt, /repository conventions and explicit user direction[\s\S]{0,260}(?:constraints|follow)[\s\S]{0,260}correctness[\s\S]{0,180}security[\s\S]{0,180}accessibility/i);
    assert.match(prompt, /conflicts[\s\S]{0,300}(?:explain|document)[\s\S]{0,180}smallest safer alternative/i);
    assert.match(prompt, /Never report success[\s\S]{0,240}(?:type-checking|tests|build)[\s\S]{0,220}(?:fail|blocked)/i);
    assert.match(prompt, /Status[\s\S]*Summary[\s\S]*Files Changed[\s\S]*Verification/i);
    assert.doesNotMatch(prompt, /grimoire\.angular-coder|CLAUDE\.md|\bSkill\b|WebSearch|WebFetch|context7|TaskCreate|TaskUpdate|TaskList|TaskOutput|TaskStop|Persistent Agent Memory/i);
    assert.doesNotMatch(prompt, /Angular\s*(?:1[5-9]|2\d)(?:\+|\.0|\s+or\s+(?:later|newer)|\s+and\s+(?:later|newer))/i);
    assert.doesNotMatch(prompt, /(?:standalone components|ChangeDetectionStrategy\.OnPush|inject\(\)|functional guards)[^\n]*(?:Never|always)/i);
  });
});

describe("agent discovery", () => {
  it("applies project then user then built-in precedence", () => {
    const root = temporaryDirectory();
    const builtInDir = join(root, "builtin");
    const userDir = join(root, "user");
    const projectDir = join(root, "project");

    for (const name of GUILD_MEMBER_NAMES) writeAgent(builtInDir, name, undefined, undefined, `Built-in ${name}`);
    writeAgent(userDir, "csharp-coder", "User C# coder", undefined, "User prompt");
    writeAgent(projectDir, "csharp-coder", "Project C# coder", undefined, "Project prompt");

    const result = discoverGuildMembers({ builtInDir, userDir, projectDir, includeProject: true });
    const selected = result.members.find((agent) => agent.name === "csharp-coder");

    assert.equal(selected?.source, "project");
    assert.equal(selected?.description, "Project C# coder");
    assert.equal(selected?.systemPrompt, "Project prompt");
  });

  it("ignores project definitions when project loading is not trusted", () => {
    const root = temporaryDirectory();
    const builtInDir = join(root, "builtin");
    const projectDir = join(root, "project");
    writeAgent(builtInDir, "dotnet-architect", "Built in");
    writeAgent(projectDir, "dotnet-architect", "Project override");

    const result = discoverGuildMembers({ builtInDir, projectDir, includeProject: false });

    assert.equal(result.members[0].source, "builtin");
    assert.equal(result.members[0].description, "Built in");
  });

  it("rejects an override that changes its hard tool boundary and falls back", () => {
    const root = temporaryDirectory();
    const builtInDir = join(root, "builtin");
    const userDir = join(root, "user");
    writeAgent(builtInDir, "frontend-architect", "Built in");
    writeAgent(userDir, "frontend-architect", "Unsafe override", ["read", "bash"]);

    const result = discoverGuildMembers({ builtInDir, userDir });

    assert.equal(result.members[0].source, "builtin");
    assert.match(result.warnings.join("\n"), /frontend-architect.*tool boundary/i);
  });

  it("does not add agents outside the approved roster", () => {
    const root = temporaryDirectory();
    const builtInDir = join(root, "builtin");
    writeAgent(builtInDir, "csharp-coder");
    writeAgent(builtInDir, "unapproved-agent", "Not part of this package", ["read"]);

    const result = discoverGuildMembers({ builtInDir });

    assert.deepEqual(result.members.map((agent) => agent.name), ["csharp-coder"]);
  });

  it("finds the nearest project agent directory while walking ancestors", () => {
    const root = temporaryDirectory();
    const projectAgents = join(root, ".pi", "agents");
    const nested = join(root, "src", "features", "orders");
    mkdirSync(projectAgents, { recursive: true });
    mkdirSync(nested, { recursive: true });

    assert.equal(findNearestProjectAgentsDir(nested), projectAgents);
  });
});
