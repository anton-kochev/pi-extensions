import { createHash } from "node:crypto";

export const AUTOMATIC_ENTRY_TYPE = "pithos.translate.automatic";

export interface TranslationUsageRecord {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

export interface AutomaticTranslationBlock {
  source: string;
  sourceFingerprint: string;
  translated: string;
}

export interface AutomaticTranslationRecordV1 {
  version: 1;
  language: string;
  model: string;
  sourceFingerprint: string;
  blocks: AutomaticTranslationBlock[];
  usage: TranslationUsageRecord;
  timestamp: number;
}

export interface AutomaticTranslationSuppression {
  kind: "suppressed";
  source: string;
  sourceFingerprint: string;
}

export interface AutomaticTranslationSuccess extends AutomaticTranslationBlock {
  kind: "translated";
}

export interface AutomaticTranslationRecordV2 {
  version: 2;
  language: string;
  model: string;
  sourceFingerprint: string;
  outcomes: Array<AutomaticTranslationSuccess | AutomaticTranslationSuppression>;
  usage: TranslationUsageRecord;
  timestamp: number;
}

export type AutomaticTranslationRecord = AutomaticTranslationRecordV1 | AutomaticTranslationRecordV2;

interface TransformContext {
  messageType: "user" | "assistant" | "assistant-thinking";
  isStreaming: boolean;
}

interface DisplayTranslation {
  language: string;
  markdown: string;
}

const MARKDOWN_ASCII_PUNCTUATION = new Set(`!"#$%&'()*+,-./:;<=>?@[\\]^_\`{|}~`);

export function fingerprintMarkdown(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

export class TranslationDisplayCache {
  private readonly translations = new Map<string, Map<string, DisplayTranslation>>();

  restore(branch: readonly unknown[]): void {
    this.translations.clear();
    for (const entry of branch) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as { type?: unknown; customType?: unknown; data?: unknown };
      if (candidate.type !== "custom" || candidate.customType !== AUTOMATIC_ENTRY_TYPE) continue;
      const record = parseAutomaticRecord(candidate.data);
      if (record) this.add(record);
    }
  }

  add(record: AutomaticTranslationRecord): boolean {
    if (!isValidRecord(record)) return false;
    const outcomes = record.version === 1
      ? record.blocks.map((block): AutomaticTranslationSuccess => ({ kind: "translated", ...block }))
      : record.outcomes;
    for (const outcome of outcomes) {
      // Pi trims assistant text blocks before invoking Markdown transformers. Normalizing
      // here also keeps records written by older versions usable after session resume.
      const renderedSource = outcome.source.trim();
      if (outcome.kind === "suppressed") {
        this.showOriginal([renderedSource]);
        continue;
      }
      const renderedFingerprint = fingerprintMarkdown(renderedSource);
      const bySource = this.translations.get(renderedFingerprint) ?? new Map<string, DisplayTranslation>();
      bySource.set(renderedSource, { language: record.language, markdown: outcome.translated });
      this.translations.set(renderedFingerprint, bySource);
    }
    return true;
  }

  showOriginal(sources: readonly string[]): void {
    for (const source of sources) {
      const renderedSource = source.trim();
      const fingerprint = fingerprintMarkdown(renderedSource);
      const bySource = this.translations.get(fingerprint);
      bySource?.delete(renderedSource);
      if (bySource?.size === 0) this.translations.delete(fingerprint);
    }
  }

  transform(markdown: string, context: TransformContext, automaticMode: boolean): string {
    if (context.messageType !== "assistant") return markdown;
    if (context.isStreaming) return automaticMode ? "" : markdown;
    const translation = this.translations.get(fingerprintMarkdown(markdown))?.get(markdown);
    if (!translation) return markdown;
    return `*Translated · ${escapeMarkdownLabel(translation.language)}*\n\n${translation.markdown}`;
  }
}

function escapeMarkdownLabel(value: string): string {
  const collapsed = value.trim().replace(/\s+/gu, " ");
  return Array.from(collapsed, (character) =>
    MARKDOWN_ASCII_PUNCTUATION.has(character) ? `\\${character}` : character
  ).join("");
}

export function parseAutomaticRecord(value: unknown): AutomaticTranslationRecord | undefined {
  return isValidRecord(value) ? value : undefined;
}

function isValidRecord(value: unknown): value is AutomaticTranslationRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as {
    version?: unknown;
    language?: unknown;
    model?: unknown;
    sourceFingerprint?: unknown;
    blocks?: unknown;
    outcomes?: unknown;
    usage?: unknown;
    timestamp?: unknown;
  };
  if (
    (record.version !== 1 && record.version !== 2) ||
    typeof record.language !== "string" || !record.language ||
    typeof record.model !== "string" || !record.model ||
    typeof record.sourceFingerprint !== "string" ||
    typeof record.timestamp !== "number" || !Number.isFinite(record.timestamp) ||
    !isUsage(record.usage)
  ) return false;

  if (record.version === 1) {
    if (!Array.isArray(record.blocks) || record.blocks.length === 0 || !record.blocks.every(isValidTranslationBlock)) {
      return false;
    }
    return record.sourceFingerprint === fingerprintMarkdown(record.blocks.map((block) => block.source).join("\n\n"));
  }

  if (!Array.isArray(record.outcomes) || record.outcomes.length === 0 || !record.outcomes.every(isValidOutcome)) {
    return false;
  }
  return record.sourceFingerprint === fingerprintMarkdown(record.outcomes.map((outcome) => outcome.source).join("\n\n"));
}

function isValidTranslationBlock(value: unknown): value is AutomaticTranslationBlock {
  if (!isValidSource(value)) return false;
  const block = value as typeof value & { translated?: unknown };
  return typeof block.translated === "string" && !!block.translated.trim();
}

function isValidOutcome(
  value: unknown,
): value is AutomaticTranslationSuccess | AutomaticTranslationSuppression {
  if (!isValidSource(value)) return false;
  const outcome = value as typeof value & { kind?: unknown; translated?: unknown };
  if (outcome.kind === "suppressed") return true;
  return outcome.kind === "translated" && typeof outcome.translated === "string" && !!outcome.translated.trim();
}

function isValidSource(value: unknown): value is { source: string; sourceFingerprint: string } {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return typeof source.source === "string" && !!source.source.trim() &&
    source.sourceFingerprint === fingerprintMarkdown(source.source);
}

function isUsage(value: unknown): value is TranslationUsageRecord {
  if (!value || typeof value !== "object") return false;
  const usage = value as Record<string, unknown>;
  return ["input", "output", "cacheRead", "cacheWrite", "totalTokens", "cost"]
    .every((key) => typeof usage[key] === "number" && Number.isFinite(usage[key]));
}
