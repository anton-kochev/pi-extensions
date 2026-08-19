export interface ProtectedMarkdown {
  markdown: string;
  values: readonly string[];
}

interface Range {
  start: number;
  end: number;
}

const PLACEHOLDER_PATTERN = /⟦PITHOS_TRANSLATE_(\d{4})⟧/g;

function placeholder(index: number): string {
  return `⟦PITHOS_TRANSLATE_${index.toString().padStart(4, "0")}⟧`;
}

export function protectMarkdown(source: string): ProtectedMarkdown {
  const ranges = findFencedRanges(source);
  ranges.push(...findInlineCodeRanges(source, ranges));
  ranges.push(...findLinkDestinationRanges(source, ranges));
  ranges.push(...findReferenceLabelRanges(source, ranges));
  ranges.push(...findShortcutReferenceRanges(source, ranges));
  ranges.push(...findReferenceDestinationRanges(source, ranges));
  ranges.push(...findAutolinkRanges(source, ranges));
  ranges.push(...findBareUrlRanges(source, ranges));
  ranges.sort((left, right) => left.start - right.start);

  const values: string[] = [];
  let cursor = 0;
  let markdown = "";
  for (const range of ranges) {
    if (range.start < cursor) continue;
    markdown += source.slice(cursor, range.start);
    values.push(source.slice(range.start, range.end));
    markdown += placeholder(values.length - 1);
    cursor = range.end;
  }
  markdown += source.slice(cursor);
  return { markdown, values };
}

export function restoreMarkdown(translated: string, protection: ProtectedMarkdown): string {
  const matches = [...translated.matchAll(PLACEHOLDER_PATTERN)];
  const markerMentions = translated.split("PITHOS_TRANSLATE_").length - 1;
  if (matches.length !== markerMentions || matches.length !== protection.values.length) {
    throw new Error("Protected Markdown placeholder set was altered");
  }

  const counts = new Map<number, number>();
  for (const match of matches) {
    const index = Number(match[1]);
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  for (let index = 0; index < protection.values.length; index++) {
    if (counts.get(index) !== 1) throw new Error("Protected Markdown placeholder set was altered");
  }

  return translated.replace(PLACEHOLDER_PATTERN, (_match, rawIndex: string) => protection.values[Number(rawIndex)]!);
}

interface Fence extends Range {
  info: string;
}

function findFencedRanges(source: string): Range[] {
  return scanFences(source);
}

function scanFences(source: string): Fence[] {
  const fences: Fence[] = [];
  const lines = source.matchAll(/^.*(?:\r?\n|$)/gm);
  const lineList = [...lines].filter((match) => match[0] !== "");
  for (let index = 0; index < lineList.length; index++) {
    const line = lineList[index]!;
    const opening = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)(?:\r?\n|$)/.exec(line[0]);
    if (!opening) continue;
    const marker = opening[2]!;
    let end = source.length;
    for (let closingIndex = index + 1; closingIndex < lineList.length; closingIndex++) {
      const closing = lineList[closingIndex]!;
      const expression = new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*(?:\\r?\\n|$)`);
      if (!expression.test(closing[0])) continue;
      // Keep the closing line break outside the protected range so following
      // prose remains a separate line in the model input for LF and CRLF.
      end = closing.index + closing[0].replace(/\r?\n$/, "").length;
      index = closingIndex;
      break;
    }
    fences.push({ start: line.index, end, info: opening[3]! });
  }
  return fences;
}

export function containsMermaidFence(source: string): boolean {
  return scanFences(source).some((fence) => {
    // Pi identifies Mermaid from the first whitespace-delimited token in token.lang.
    const firstInfoToken = fence.info.trim().split(/\s+/, 1)[0];
    return firstInfoToken?.toLowerCase() === "mermaid";
  });
}

function findInlineCodeRanges(source: string, excluded: readonly Range[]): Range[] {
  const ranges: Range[] = [];
  for (let index = 0; index < source.length; index++) {
    if (isExcluded(index, excluded)) continue;
    if (source[index] !== "`") continue;
    let runEnd = index + 1;
    while (source[runEnd] === "`") runEnd++;
    const markerLength = runEnd - index;
    let closing = source.indexOf("`", runEnd);
    while (closing >= 0) {
      let closingRunEnd = closing + 1;
      while (source[closingRunEnd] === "`") closingRunEnd++;
      if (!isExcluded(closing, excluded) && closingRunEnd - closing === markerLength) break;
      closing = source.indexOf("`", closingRunEnd);
    }
    if (closing < 0) {
      index = runEnd - 1;
      continue;
    }
    const end = closing + markerLength;
    ranges.push({ start: index, end });
    index = end - 1;
  }
  return ranges;
}

function findLinkDestinationRanges(source: string, excluded: readonly Range[]): Range[] {
  const ranges: Range[] = [];
  for (let index = 0; index < source.length - 1; index++) {
    if (source[index] !== "]" || source[index + 1] !== "(" || isExcluded(index, excluded)) continue;
    let start = index + 2;
    while (source[start] === " " || source[start] === "\t") start++;
    if (source[start] === "<") {
      let end = start + 1;
      while (end < source.length && source[end] !== ">" && source[end] !== "\n") end++;
      if (source[end] === ">") ranges.push({ start, end: end + 1 });
      continue;
    }
    let depth = 0;
    let end = start;
    for (; end < source.length; end++) {
      const character = source[end]!;
      if (character === "\\") {
        end++;
        continue;
      }
      if (character === "(") {
        depth++;
        continue;
      }
      if (character === ")") {
        if (depth === 0) break;
        depth--;
        continue;
      }
      if ((character === " " || character === "\t" || character === "\n") && depth === 0) break;
    }
    if (end > start) ranges.push({ start, end });
  }
  return ranges;
}

function findReferenceLabelRanges(source: string, excluded: readonly Range[]): Range[] {
  const ranges: Range[] = [];
  for (const match of source.matchAll(/!?\[[^\]\r\n]+\]\[([^\]\r\n]*)\]/g)) {
    if (isExcluded(match.index, excluded)) continue;
    const secondLabelOffset = match[0].lastIndexOf("[");
    if (match[1] === "") {
      // A collapsed reference derives its identifier from the visible label, so
      // protect the complete construct rather than allow the model to break it.
      ranges.push({ start: match.index, end: match.index + match[0].length });
    } else {
      const start = match.index + secondLabelOffset;
      ranges.push({ start, end: match.index + match[0].length });
    }
  }
  for (const match of source.matchAll(/^ {0,3}(\[[^\]\r\n]+\]):/gm)) {
    const start = match.index + match[0].indexOf(match[1]!);
    if (!isExcluded(start, excluded)) ranges.push({ start, end: start + match[1]!.length });
  }
  return ranges;
}

function findShortcutReferenceRanges(source: string, excluded: readonly Range[]): Range[] {
  const definitions = new Set<string>();
  for (const match of source.matchAll(/^ {0,3}\[([^\]\r\n]+)\]:/gm)) {
    definitions.add(normalizeReferenceLabel(match[1]!));
  }
  if (definitions.size === 0) return [];

  const ranges: Range[] = [];
  for (const match of source.matchAll(/!?\[([^\]\r\n]+)\]/g)) {
    if (isExcluded(match.index, excluded)) continue;
    const following = source[match.index + match[0].length];
    if (following === "(" || following === "[" || following === ":") continue;
    if (definitions.has(normalizeReferenceLabel(match[1]!))) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return ranges;
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/[ \t]+/g, " ").toLowerCase();
}

function findReferenceDestinationRanges(source: string, excluded: readonly Range[]): Range[] {
  const ranges: Range[] = [];
  const definitions = source.matchAll(/^ {0,3}\[[^\]\r\n]+\]:[ \t]*/gm);
  for (const definition of definitions) {
    const start = definition.index + definition[0].length;
    if (isExcluded(start, excluded)) continue;
    if (source[start] === "<") {
      const closing = source.indexOf(">", start + 1);
      if (closing >= 0 && !/[\r\n]/.test(source.slice(start, closing))) {
        ranges.push({ start, end: closing + 1 });
      }
      continue;
    }
    const end = findDestinationEnd(source, start);
    if (end > start) ranges.push({ start, end });
  }
  return ranges;
}

function findAutolinkRanges(source: string, excluded: readonly Range[]): Range[] {
  const ranges: Range[] = [];
  for (const match of source.matchAll(/<(?:https?:\/\/|mailto:)[^<>\s]+>/gi)) {
    if (!isExcluded(match.index, excluded)) ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function findBareUrlRanges(source: string, excluded: readonly Range[]): Range[] {
  const ranges: Range[] = [];
  for (const match of source.matchAll(/\b(?:https?:\/\/|mailto:)[^\s<>]+/gi)) {
    if (isExcluded(match.index, excluded)) continue;
    const end = trimBareUrlEnd(source, match.index, match.index + match[0].length);
    if (end > match.index) ranges.push({ start: match.index, end });
  }
  return ranges;
}

function findDestinationEnd(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    const character = source[index]!;
    if (character === "\\") {
      index++;
      continue;
    }
    if (character === "(") {
      depth++;
      continue;
    }
    if (character === ")" && depth > 0) {
      depth--;
      continue;
    }
    if ((character === " " || character === "\t" || character === "\r" || character === "\n") && depth === 0) {
      return index;
    }
  }
  return source.length;
}

function trimBareUrlEnd(source: string, start: number, initialEnd: number): number {
  let end = initialEnd;
  while (end > start && /[.,!?;:]/.test(source[end - 1]!)) end--;
  for (const [opening, closing] of [["(", ")"], ["[", "]"], ["{", "}"]] as const) {
    while (
      source[end - 1] === closing &&
      countCharacter(source, start, end, closing) > countCharacter(source, start, end, opening)
    ) end--;
  }
  return end;
}

function countCharacter(source: string, start: number, end: number, character: string): number {
  let count = 0;
  for (let index = start; index < end; index++) {
    if (source[index] === character) count++;
  }
  return count;
}

function isExcluded(index: number, ranges: readonly Range[]): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}
