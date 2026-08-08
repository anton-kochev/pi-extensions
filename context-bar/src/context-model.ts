import { homedir } from "node:os";
import { isAbsolute, normalize, resolve } from "node:path";
import { formatSkillsForPrompt, type BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";

export const CONTEXT_CATEGORY_ORDER = [
  "prompt",
  "project",
  "skills",
  "tools",
  "conversation",
  "other",
  "free",
] as const;

export type ContextCategory = (typeof CONTEXT_CATEGORY_ORDER)[number];
export type EstimationBasis = "provider-backed" | "local-estimate";
export type ContextCategoryCounts = Record<ContextCategory, number>;

export interface ContextSnapshot {
  categories: ContextCategoryCounts;
  tokens: number;
  contextWindow: number;
  percent: number;
  basis: EstimationBasis;
  model?: { provider: string; id: string };
}

interface ContentBlockLike {
  type: string;
  text?: string;
  thinking?: string;
  data?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
}

export interface ContextMessageLike {
  role: string;
  content?: string | ContentBlockLike[];
  timestamp?: number;
  [key: string]: unknown;
}

export interface ContextToolLike {
  name: string;
  description?: string;
  parameters?: unknown;
  promptGuidelines?: string[];
}

export interface ContextModelInput {
  systemPrompt: string;
  systemPromptOptions?: BuildSystemPromptOptions;
  messages: ContextMessageLike[];
  tools: ContextToolLike[];
  contextWindow: number;
  cwd?: string;
  aggregateTokens?: number | null;
  aggregateMatchesRequest?: boolean;
  model?: { provider: string; id: string };
}

const IMAGE_ESTIMATED_CHARS = 4_800;

function estimateChars(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

function contentChars(content: string | ContentBlockLike[] | undefined): number {
  if (typeof content === "string") return content.length;
  if (!content) return 0;

  return content.reduce((total, block) => {
    if (block.type === "text") return total + (block.text?.length ?? 0);
    if (block.type === "thinking") return total + (block.thinking?.length ?? 0);
    if (block.type === "image") return total + IMAGE_ESTIMATED_CHARS;
    return total;
  }, 0);
}

function projectContextBlock(options: BuildSystemPromptOptions | undefined): string {
  const files = options?.contextFiles ?? [];
  if (files.length === 0) return "";

  let block = "\n\n<project_context>\n\n";
  block += "Project-specific instructions and guidelines:\n\n";
  for (const file of files) {
    block += `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>\n\n`;
  }
  block += "</project_context>\n";
  return block;
}

function findProjectContext(
  systemPrompt: string,
  options: BuildSystemPromptOptions | undefined,
): string {
  const structured = projectContextBlock(options);
  if (structured && systemPrompt.includes(structured)) return structured;
  return systemPrompt.match(/\n\n<project_context>\n\n[\s\S]*?<\/project_context>\n/)?.[0] ?? "";
}

function findSkillCatalogue(
  systemPrompt: string,
  options: BuildSystemPromptOptions | undefined,
): string {
  const canReadSkills = !options?.selectedTools || options.selectedTools.includes("read");
  const structured = canReadSkills ? formatSkillsForPrompt(options?.skills ?? []) : "";
  if (structured && systemPrompt.includes(structured)) return structured;

  const startMarker = "\n\nThe following skills provide specialized instructions for specific tasks.";
  const endMarker = "</available_skills>";
  const start = systemPrompt.indexOf(startMarker);
  if (start < 0) return "";
  const end = systemPrompt.indexOf(endMarker, start);
  return end < 0 ? "" : systemPrompt.slice(start, end + endMarker.length);
}

function normalizeContextPath(path: string, cwd: string | undefined): string {
  let expanded = path.startsWith("@") ? path.slice(1) : path;
  if (expanded === "~") expanded = homedir();
  else if (expanded.startsWith("~/")) expanded = resolve(homedir(), expanded.slice(2));
  if (isAbsolute(expanded)) return normalize(expanded);
  return cwd ? resolve(cwd, expanded) : normalize(expanded);
}

function skillPathsFromCatalogue(
  catalogue: string,
  options: BuildSystemPromptOptions | undefined,
  cwd: string | undefined,
): Set<string> {
  const paths = new Set(
    (options?.skills ?? []).map((skill) => normalizeContextPath(skill.filePath, cwd)),
  );
  for (const match of catalogue.matchAll(/<location>([\s\S]*?)<\/location>/g)) {
    const path = match[1]!
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    paths.add(normalizeContextPath(path, cwd));
  }
  return paths;
}

function safeJsonLength(value: unknown): number {
  if (value === undefined) return 0;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function toolGuidanceChars(input: ContextModelInput): number {
  const fragments = new Set<string>();
  const options = input.systemPromptOptions;
  if (options?.customPrompt) return 0;
  const selected = new Set(options?.selectedTools ?? input.tools.map((tool) => tool.name));

  for (const [name, snippet] of Object.entries(options?.toolSnippets ?? {})) {
    if (selected.has(name)) fragments.add(`- ${name}: ${snippet}`);
  }
  for (const guideline of options?.promptGuidelines ?? []) {
    const normalized = guideline.trim();
    if (normalized) fragments.add(`- ${normalized}`);
  }
  for (const tool of input.tools) {
    for (const guideline of tool.promptGuidelines ?? []) {
      const normalized = guideline.trim();
      if (normalized) fragments.add(`- ${normalized}`);
    }
  }

  let chars = 0;
  for (const fragment of fragments) {
    if (input.systemPrompt.includes(fragment)) chars += fragment.length;
  }
  return chars;
}

function toolDefinitionChars(tools: ContextToolLike[]): number {
  return tools.reduce(
    (chars, tool) => chars
      + tool.name.length
      + (tool.description?.length ?? 0)
      + safeJsonLength(tool.parameters),
    0,
  );
}

interface MessageCategoryCounts {
  skills: number;
  tools: number;
  conversation: number;
}

function splitExplicitSkill(text: string): { skillChars: number; conversationChars: number } | undefined {
  const match = text.match(/^(<skill name="[^"]+" location="[^"]+">\n[\s\S]*?\n<\/skill>)(?:\n\n([\s\S]+))?$/);
  if (!match) return undefined;
  return {
    skillChars: match[1]!.length,
    conversationChars: match[2]?.length ?? 0,
  };
}

function estimateUserContent(content: string | ContentBlockLike[] | undefined): {
  skills: number;
  conversation: number;
} {
  let skillChars = 0;
  let conversationChars = 0;
  const accountText = (text: string) => {
    const explicitSkill = splitExplicitSkill(text);
    if (explicitSkill) {
      skillChars += explicitSkill.skillChars;
      conversationChars += explicitSkill.conversationChars;
    } else {
      conversationChars += text.length;
    }
  };

  if (typeof content === "string") {
    accountText(content);
  } else {
    for (const block of content ?? []) {
      if (block.type === "text") accountText(block.text ?? "");
      else if (block.type === "image") conversationChars += IMAGE_ESTIMATED_CHARS;
    }
  }

  return {
    skills: estimateChars(skillChars),
    conversation: estimateChars(conversationChars),
  };
}

function hasCorrelatedProviderUsage(input: ContextModelInput): boolean {
  if (input.aggregateMatchesRequest === false) return false;
  if (!input.model || input.aggregateTokens == null || !Number.isFinite(input.aggregateTokens)) return false;

  for (let index = input.messages.length - 1; index >= 0; index--) {
    const message = input.messages[index]!;
    if (message.role !== "assistant") continue;
    const usage = message.usage && typeof message.usage === "object"
      ? message.usage as Record<string, unknown>
      : undefined;
    const nativeTotal = typeof usage?.totalTokens === "number" ? usage.totalTokens : 0;
    const componentTotal = ["input", "output", "cacheRead", "cacheWrite"].reduce(
      (total, field) => total + (typeof usage?.[field] === "number" ? usage[field] as number : 0),
      0,
    );
    const usageTokens = nativeTotal > 0 ? nativeTotal : componentTotal;
    if (message.stopReason === "aborted" || message.stopReason === "error" || usageTokens <= 0) continue;
    return message.provider === input.model.provider && message.model === input.model.id;
  }

  return false;
}

function estimateMessages(
  messages: ContextMessageLike[],
  skillPaths: ReadonlySet<string>,
  cwd: string | undefined,
): MessageCategoryCounts {
  let skillTokens = 0;
  let toolTokens = 0;
  let conversationTokens = 0;
  const skillReadCallIds = new Set<string>();

  for (const message of messages) {
    if (message.role === "user") {
      const user = estimateUserContent(message.content);
      skillTokens += user.skills;
      conversationTokens += user.conversation;
      continue;
    }

    if (message.role === "assistant" && Array.isArray(message.content)) {
      let assistantConversationChars = 0;
      let assistantToolChars = 0;
      for (const block of message.content) {
        if (block.type === "text") assistantConversationChars += block.text?.length ?? 0;
        if (block.type === "thinking") assistantConversationChars += block.thinking?.length ?? 0;
        if (block.type === "toolCall") {
          assistantToolChars += (block.name?.length ?? 0) + safeJsonLength(block.arguments);
          const path = block.arguments && typeof block.arguments === "object"
            ? (block.arguments as { path?: unknown }).path
            : undefined;
          if (
            block.name === "read"
            && block.id
            && typeof path === "string"
            && skillPaths.has(normalizeContextPath(path, cwd))
          ) {
            skillReadCallIds.add(block.id);
          }
        }
      }
      conversationTokens += estimateChars(assistantConversationChars);
      toolTokens += estimateChars(assistantToolChars);
      continue;
    }

    if (message.role === "toolResult") {
      const resultTokens = estimateChars(contentChars(message.content));
      const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : undefined;
      if (toolCallId && skillReadCallIds.has(toolCallId)) skillTokens += resultTokens;
      else toolTokens += resultTokens;
      continue;
    }

    if (message.role === "bashExecution" && message.excludeFromContext !== true) {
      const command = typeof message.command === "string" ? message.command : "";
      const output = typeof message.output === "string" ? message.output : "";
      toolTokens += estimateChars(command.length + output.length);
      continue;
    }

    if (message.role === "custom") {
      conversationTokens += estimateChars(contentChars(message.content));
      continue;
    }

    if (message.role === "branchSummary" || message.role === "compactionSummary") {
      const summary = typeof message.summary === "string" ? message.summary : "";
      conversationTokens += estimateChars(summary.length);
    }
  }

  return { skills: skillTokens, tools: toolTokens, conversation: conversationTokens };
}

export function buildContextSnapshot(input: ContextModelInput): ContextSnapshot {
  const projectChars = findProjectContext(input.systemPrompt, input.systemPromptOptions).length;
  const project = estimateChars(projectChars);
  const skillCatalogue = findSkillCatalogue(input.systemPrompt, input.systemPromptOptions);
  const skillChars = skillCatalogue.length;
  const cwd = input.cwd ?? input.systemPromptOptions?.cwd;
  const messages = estimateMessages(
    input.messages,
    skillPathsFromCatalogue(skillCatalogue, input.systemPromptOptions, cwd),
    cwd,
  );
  const skills = estimateChars(skillChars) + messages.skills;
  const guidanceChars = toolGuidanceChars(input);
  const tools = estimateChars(toolDefinitionChars(input.tools) + guidanceChars) + messages.tools;
  const prompt = estimateChars(input.systemPrompt.length - projectChars - skillChars - guidanceChars);
  const conversation = messages.conversation;
  const known = { prompt, project, skills, tools, conversation };
  const localTokens = Object.values(known).reduce((sum, value) => sum + value, 0);
  const providerBacked = hasCorrelatedProviderUsage(input);
  const tokens = providerBacked ? Math.max(0, input.aggregateTokens!) : localTokens;
  let other = 0;

  if (providerBacked && localTokens <= tokens) {
    other = tokens - localTokens;
  } else if (providerBacked && localTokens > tokens && localTokens > 0) {
    const scale = tokens / localTokens;
    for (const category of Object.keys(known) as Array<keyof typeof known>) {
      known[category] *= scale;
    }
  }

  const contextWindow = Math.max(0, input.contextWindow);
  return {
    categories: {
      ...known,
      other,
      free: Math.max(0, contextWindow - tokens),
    },
    tokens,
    contextWindow,
    percent: contextWindow > 0 ? Math.round((tokens / contextWindow) * 100) : 0,
    basis: providerBacked ? "provider-backed" : "local-estimate",
    model: input.model,
  };
}
