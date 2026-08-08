import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSkillsForPrompt, type Skill } from "@earendil-works/pi-coding-agent";
import { buildContextSnapshot } from "../src/context-model.ts";

describe("buildContextSnapshot", () => {
  it("locally estimates a plain system prompt and user conversation without overlap", () => {
    const snapshot = buildContextSnapshot({
      systemPrompt: "p".repeat(40),
      messages: [{ role: "user", content: "u".repeat(20), timestamp: 1 }],
      tools: [],
      contextWindow: 100,
    });

    assert.equal(snapshot.basis, "local-estimate");
    assert.equal(snapshot.categories.prompt, 10);
    assert.equal(snapshot.categories.conversation, 5);
    assert.equal(snapshot.tokens, 15);
    assert.equal(snapshot.categories.free, 85);
  });

  it("separates loaded project instructions from the surrounding system prompt", () => {
    const projectBlock = [
      "",
      "",
      "<project_context>",
      "",
      "Project-specific instructions and guidelines:",
      "",
      '<project_instructions path="AGENTS.md">',
      "project rules",
      "</project_instructions>",
      "",
      "</project_context>",
      "",
    ].join("\n");
    const snapshot = buildContextSnapshot({
      systemPrompt: `${"p".repeat(40)}${projectBlock}`,
      systemPromptOptions: {
        cwd: "/repo",
        contextFiles: [{ path: "AGENTS.md", content: "project rules" }],
      },
      messages: [],
      tools: [],
      contextWindow: 1_000,
    });

    assert.equal(snapshot.categories.project, Math.ceil(projectBlock.length / 4));
    assert.equal(snapshot.categories.prompt, 10);
    assert.equal(snapshot.tokens, snapshot.categories.project + snapshot.categories.prompt);
  });

  it("separates the visible skill catalogue from the prompt", () => {
    const skills = [{
      name: "tdd",
      description: "Drive changes test-first",
      filePath: "/skills/tdd/SKILL.md",
      baseDir: "/skills/tdd",
      sourceInfo: {} as Skill["sourceInfo"],
      disableModelInvocation: false,
    }];
    const skillBlock = formatSkillsForPrompt(skills);
    const snapshot = buildContextSnapshot({
      systemPrompt: `${"p".repeat(40)}${skillBlock}`,
      systemPromptOptions: { cwd: "/repo", skills },
      messages: [],
      tools: [],
      contextWindow: 1_000,
    });

    assert.equal(snapshot.categories.skills, Math.ceil(skillBlock.length / 4));
    assert.equal(snapshot.categories.prompt, 10);
  });

  it("discovers generated project and skill sections from the effective prompt on resume", () => {
    const skills = [{
      name: "tdd",
      description: "Drive changes test-first",
      filePath: "/skills/tdd/SKILL.md",
      baseDir: "/skills/tdd",
      sourceInfo: {} as Skill["sourceInfo"],
      disableModelInvocation: false,
    }];
    const projectBlock = [
      "",
      "",
      "<project_context>",
      "",
      "Project-specific instructions and guidelines:",
      "",
      '<project_instructions path="AGENTS.md">',
      "project rules",
      "</project_instructions>",
      "",
      "</project_context>",
      "",
    ].join("\n");
    const skillBlock = formatSkillsForPrompt(skills);
    const snapshot = buildContextSnapshot({
      systemPrompt: `${"p".repeat(40)}${projectBlock}${skillBlock}`,
      messages: [],
      tools: [],
      contextWindow: 1_000,
    });

    assert.equal(snapshot.categories.project, Math.ceil(projectBlock.length / 4));
    assert.equal(snapshot.categories.skills, Math.ceil(skillBlock.length / 4));
    assert.equal(snapshot.categories.prompt, 10);
  });

  it("counts active tool schemas and prompt guidance as tools", () => {
    const tool = {
      name: "read",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } } },
      promptGuidelines: ["Read before editing"],
    };
    const snippet = `- read: Read files`;
    const guideline = `- Read before editing`;
    const systemPrompt = `${"p".repeat(40)}\n${snippet}\n${guideline}`;
    const definitionChars = tool.name.length
      + tool.description.length
      + JSON.stringify(tool.parameters).length;
    const guidanceChars = snippet.length + guideline.length;
    const snapshot = buildContextSnapshot({
      systemPrompt,
      systemPromptOptions: {
        cwd: "/repo",
        selectedTools: ["read"],
        toolSnippets: { read: "Read files" },
        promptGuidelines: ["Read before editing"],
      },
      messages: [],
      tools: [tool],
      contextWindow: 1_000,
    });

    assert.equal(snapshot.categories.tools, Math.ceil((definitionChars + guidanceChars) / 4));
    assert.equal(snapshot.categories.prompt, Math.ceil((systemPrompt.length - guidanceChars) / 4));
  });

  it("does not invent tool guidance sections inside a custom system prompt", () => {
    const customPrompt = "Custom instructions with a coincidental - read: Read files phrase.";
    const snapshot = buildContextSnapshot({
      systemPrompt: customPrompt,
      systemPromptOptions: {
        cwd: "/repo",
        customPrompt,
        selectedTools: ["read"],
        toolSnippets: { read: "Read files" },
      },
      messages: [],
      tools: [],
      contextWindow: 1_000,
    });

    assert.equal(snapshot.categories.tools, 0);
    assert.equal(snapshot.categories.prompt, Math.ceil(customPrompt.length / 4));
  });

  it("attributes an explicit skill block to skills and trailing arguments to conversation", () => {
    const skillBlock = '<skill name="tdd" location="/skills/tdd/SKILL.md">\nReferences are relative.\n\nDrive with tests.\n</skill>';
    const argument = "change the parser";
    const snapshot = buildContextSnapshot({
      systemPrompt: "",
      messages: [{
        role: "user",
        content: `${skillBlock}\n\n${argument}`,
        timestamp: 1,
      }],
      tools: [],
      contextWindow: 1_000,
    });

    assert.equal(snapshot.categories.skills, Math.ceil(skillBlock.length / 4));
    assert.equal(snapshot.categories.conversation, Math.ceil(argument.length / 4));
  });

  it("recognizes an explicit skill inside block-based user content", () => {
    const skillBlock = '<skill name="tdd" location="/skills/tdd/SKILL.md">\nBody\n</skill>';
    const snapshot = buildContextSnapshot({
      systemPrompt: "",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: `${skillBlock}\n\nargument` },
          { type: "image", data: "ignored" },
        ],
      }],
      tools: [],
      contextWindow: 10_000,
    });

    assert.equal(snapshot.categories.skills, Math.ceil(skillBlock.length / 4));
    assert.equal(snapshot.categories.conversation, Math.ceil("argument".length / 4) + 1_200);
  });

  it("separates assistant tool traffic and bash output from conversational content", () => {
    const toolArguments = { path: "README.md" };
    const snapshot = buildContextSnapshot({
      systemPrompt: "",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "inspect" },
            { type: "text", text: "I will read it." },
            { type: "toolCall", name: "read", arguments: toolArguments },
          ],
        },
        { role: "toolResult", content: [{ type: "text", text: "file body" }] },
        { role: "bashExecution", command: "pwd", output: "/repo", excludeFromContext: false },
      ],
      tools: [],
      contextWindow: 1_000,
    });
    const conversationChars = "inspect".length + "I will read it.".length;
    const toolCallChars = "read".length + JSON.stringify(toolArguments).length;
    const toolResultChars = "file body".length;
    const bashChars = "pwd".length + "/repo".length;

    assert.equal(snapshot.categories.conversation, Math.ceil(conversationChars / 4));
    assert.equal(
      snapshot.categories.tools,
      Math.ceil(toolCallChars / 4) + Math.ceil(toolResultChars / 4) + Math.ceil(bashChars / 4),
    );
  });

  it("excludes double-bang bash output from all context categories", () => {
    const snapshot = buildContextSnapshot({
      systemPrompt: "",
      messages: [{
        role: "bashExecution",
        command: "cat secret",
        output: "secret",
        excludeFromContext: true,
      }],
      tools: [],
      contextWindow: 1_000,
    });

    assert.equal(snapshot.tokens, 0);
    assert.equal(snapshot.categories.tools, 0);
  });

  it("counts custom messages and branch or compaction summaries as conversation", () => {
    const snapshot = buildContextSnapshot({
      systemPrompt: "",
      messages: [
        { role: "custom", content: "custom context" },
        { role: "branchSummary", summary: "branch context" },
        { role: "compactionSummary", summary: "compact context" },
      ],
      tools: [],
      contextWindow: 1_000,
    });

    assert.equal(
      snapshot.categories.conversation,
      Math.ceil("custom context".length / 4)
        + Math.ceil("branch context".length / 4)
        + Math.ceil("compact context".length / 4),
    );
  });

  it("attributes results from recognized skill-file reads to skills", () => {
    const skillPath = "/skills/tdd/SKILL.md";
    const skills = [{
      name: "tdd",
      description: "TDD",
      filePath: skillPath,
      baseDir: "/skills/tdd",
      sourceInfo: {} as Skill["sourceInfo"],
      disableModelInvocation: true,
    }];
    const snapshot = buildContextSnapshot({
      systemPrompt: "",
      systemPromptOptions: { cwd: "/repo", skills },
      messages: [
        {
          role: "assistant",
          content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: skillPath } }],
        },
        {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "read",
          content: [{ type: "text", text: "skill body" }],
        },
      ],
      tools: [],
      contextWindow: 1_000,
    });

    assert.equal(snapshot.categories.skills, Math.ceil("skill body".length / 4));
    assert.ok(snapshot.categories.tools > 0, "the read call itself remains tool traffic");
  });

  it("normalizes relative skill-file read paths against the working directory", () => {
    const skillPath = "/repo/.pi/skills/tdd/SKILL.md";
    const skills = [{
      name: "tdd",
      description: "TDD",
      filePath: skillPath,
      baseDir: "/repo/.pi/skills/tdd",
      sourceInfo: {} as Skill["sourceInfo"],
      disableModelInvocation: true,
    }];
    const snapshot = buildContextSnapshot({
      systemPrompt: "",
      systemPromptOptions: { cwd: "/repo", skills },
      messages: [
        {
          role: "assistant",
          content: [{
            type: "toolCall",
            id: "call-1",
            name: "read",
            arguments: { path: "@.pi/skills/tdd/../tdd/SKILL.md" },
          }],
        },
        {
          role: "toolResult",
          toolCallId: "call-1",
          content: [{ type: "text", text: "skill body" }],
        },
      ],
      tools: [],
      contextWindow: 1_000,
    });

    assert.equal(snapshot.categories.skills, Math.ceil("skill body".length / 4));
  });

  it("recognizes catalogue skill-file reads after a resumed session", () => {
    const skillPath = "/skills/tdd/SKILL.md";
    const skills = [{
      name: "tdd",
      description: "TDD",
      filePath: skillPath,
      baseDir: "/skills/tdd",
      sourceInfo: {} as Skill["sourceInfo"],
      disableModelInvocation: false,
    }];
    const skillCatalogue = formatSkillsForPrompt(skills);
    const snapshot = buildContextSnapshot({
      systemPrompt: skillCatalogue,
      messages: [
        {
          role: "assistant",
          content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: skillPath } }],
        },
        {
          role: "toolResult",
          toolCallId: "call-1",
          content: [{ type: "text", text: "skill body" }],
        },
      ],
      tools: [],
      contextWindow: 1_000,
    });

    assert.equal(
      snapshot.categories.skills,
      Math.ceil(skillCatalogue.length / 4) + Math.ceil("skill body".length / 4),
    );
  });

  it("uses a correlated provider aggregate and assigns its residual to other", () => {
    const snapshot = buildContextSnapshot({
      systemPrompt: "p".repeat(40),
      messages: [
        { role: "user", content: "u".repeat(20) },
        {
          role: "assistant",
          provider: "openai",
          model: "gpt-test",
          stopReason: "stop",
          usage: { totalTokens: 20 },
          content: [],
        },
      ],
      tools: [],
      contextWindow: 100,
      aggregateTokens: 24,
      model: { provider: "openai", id: "gpt-test" },
    });

    assert.equal(snapshot.basis, "provider-backed");
    assert.equal(snapshot.tokens, 24);
    assert.equal(snapshot.categories.other, 9);
    assert.equal(snapshot.categories.free, 76);
  });

  it("accepts provider usage components when totalTokens is zero", () => {
    const snapshot = buildContextSnapshot({
      systemPrompt: "p".repeat(40),
      messages: [{
        role: "assistant",
        provider: "openai",
        model: "gpt-test",
        stopReason: "stop",
        usage: { totalTokens: 0, input: 20, output: 10, cacheRead: 0, cacheWrite: 0 },
        content: [],
      }],
      tools: [],
      contextWindow: 100,
      aggregateTokens: 30,
      model: { provider: "openai", id: "gpt-test" },
    });

    assert.equal(snapshot.basis, "provider-backed");
    assert.equal(snapshot.tokens, 30);
  });

  it("ignores stale aggregate usage when the effective request prompt or tools changed", () => {
    const snapshot = buildContextSnapshot({
      systemPrompt: "new prompt".repeat(10),
      messages: [{
        role: "assistant",
        provider: "openai",
        model: "gpt-test",
        stopReason: "stop",
        usage: { totalTokens: 90 },
        content: [],
      }],
      tools: [],
      contextWindow: 1_000,
      aggregateTokens: 90,
      aggregateMatchesRequest: false,
      model: { provider: "openai", id: "gpt-test" },
    });

    assert.equal(snapshot.basis, "local-estimate");
    assert.equal(snapshot.categories.other, 0);
    assert.equal(snapshot.tokens, Math.ceil("new prompt".repeat(10).length / 4));
  });

  it("ignores stale aggregate usage after a model change", () => {
    const snapshot = buildContextSnapshot({
      systemPrompt: "p".repeat(40),
      messages: [{
        role: "assistant",
        provider: "openai",
        model: "old-model",
        stopReason: "stop",
        usage: { totalTokens: 90 },
        content: [],
      }],
      tools: [],
      contextWindow: 100,
      aggregateTokens: 90,
      model: { provider: "openai", id: "new-model" },
    });

    assert.equal(snapshot.basis, "local-estimate");
    assert.equal(snapshot.tokens, 10);
  });

  it("proportionally scales category estimates that exceed a correlated provider total", () => {
    const snapshot = buildContextSnapshot({
      systemPrompt: "p".repeat(40),
      messages: [
        { role: "user", content: "u".repeat(40) },
        {
          role: "assistant",
          provider: "openai",
          model: "gpt-test",
          stopReason: "stop",
          usage: { totalTokens: 10 },
          content: [],
        },
      ],
      tools: [],
      contextWindow: 100,
      aggregateTokens: 10,
      model: { provider: "openai", id: "gpt-test" },
    });

    assert.equal(snapshot.tokens, 10);
    assert.equal(snapshot.categories.other, 0);
    assert.equal(snapshot.categories.prompt, 5);
    assert.equal(snapshot.categories.conversation, 5);
  });
});
