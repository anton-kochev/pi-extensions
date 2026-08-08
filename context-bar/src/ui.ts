import type { Theme } from "@earendil-works/pi-coding-agent";
import type { EditorComponent } from "@earendil-works/pi-tui";
import {
  CONTEXT_CATEGORY_ORDER,
  type ContextCategory,
  type ContextCategoryCounts,
  type ContextSnapshot,
} from "./context-model.ts";

export const CONTEXT_CATEGORY_LABELS = {
  prompt: "Prompt",
  project: "Project context",
  skills: "Skills",
  tools: "Tools",
  conversation: "Conversation",
  other: "Other",
  free: "Free",
} as const satisfies Record<ContextCategory, string>;

const BAR_GLYPH = "▀";
const FREE_GLYPH = "─";
const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

export const CONTEXT_CATEGORY_COLORS = {
  prompt: "customMessageLabel",
  project: "mdLink",
  skills: "accent",
  tools: "success",
  conversation: "mdHeading",
  other: "muted",
  free: "borderMuted",
} as const satisfies Record<ContextCategory, Parameters<Theme["fg"]>[0]>;

export function allocateSegmentCells(
  categories: ContextCategoryCounts,
  width: number,
): Record<ContextCategory, number> {
  const available = Math.max(0, Math.floor(width));
  const weights = CONTEXT_CATEGORY_ORDER.map((category) =>
    Math.max(0, Number.isFinite(categories[category]) ? categories[category] : 0),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const cells = Object.fromEntries(
    CONTEXT_CATEGORY_ORDER.map((category) => [category, 0]),
  ) as Record<ContextCategory, number>;

  if (available === 0) return cells;
  if (total === 0) {
    cells.free = available;
    return cells;
  }

  const allocations = weights.map((weight, index) => {
    const exact = (weight / total) * available;
    return { index, cells: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = available - allocations.reduce((sum, allocation) => sum + allocation.cells, 0);
  const remainderOrder = [...allocations].sort(
    (left, right) => right.remainder - left.remainder || left.index - right.index,
  );
  for (let index = 0; index < remaining; index++) remainderOrder[index]!.cells++;
  for (const allocation of allocations) {
    cells[CONTEXT_CATEGORY_ORDER[allocation.index]!] = allocation.cells;
  }
  return cells;
}

function formatTokens(tokens: number): string {
  return Math.round(tokens).toLocaleString("en-US");
}

export function formatContextStatus(
  snapshot: ContextSnapshot,
  enabled: boolean,
  theme: Theme,
  editorBorderStyle?: (text: string) => string,
): string {
  const model = snapshot.model
    ? `${snapshot.model.provider}/${snapshot.model.id}`
    : "No model selected";
  const basis = snapshot.basis === "provider-backed" ? "provider-backed total" : "local estimate";
  const lines = [
    `context-bar is ${enabled ? "on" : "off"}`,
    `${model} · ${formatTokens(snapshot.tokens)} / ${formatTokens(snapshot.contextWindow)} tokens · ${snapshot.percent}% · ${basis}`,
    "",
    "Approximate composition:",
  ];
  for (const category of CONTEXT_CATEGORY_ORDER) {
    const labelText = `${category === "free" ? FREE_GLYPH : BAR_GLYPH} ${CONTEXT_CATEGORY_LABELS[category]}`;
    const label = category === "free" && editorBorderStyle
      ? editorBorderStyle(labelText)
      : theme.fg(CONTEXT_CATEGORY_COLORS[category], labelText);
    lines.push(`${label} · ≈${formatTokens(snapshot.categories[category])} tokens`);
  }
  return lines.join("\n");
}

function isEditorTopBorder(line: string): boolean {
  const plain = line.replace(ANSI_ESCAPE, "");
  return plain.includes("─") && /^[─↑\d\s]+$/u.test(plain);
}

export function withoutTopEditorBorder(editor: EditorComponent): EditorComponent {
  return new Proxy(editor, {
    get(target, property) {
      if (property === "render") {
        return (width: number): string[] => {
          const lines = target.render(width);
          return lines[0] !== undefined && isEditorTopBorder(lines[0]) ? lines.slice(1) : lines;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
  });
}

export interface ContextBarComponent {
  render(width: number): string[];
  invalidate(): void;
}

export function createContextBarComponent(
  getSnapshot: () => ContextSnapshot,
  theme: Theme,
  getEditorBorderStyle?: () => ((text: string) => string) | undefined,
): ContextBarComponent {
  return {
    render(width: number): string[] {
      const available = Math.max(0, Math.floor(width));
      if (available === 0) return [""];

      const snapshot = getSnapshot();
      const percentage = `${snapshot.percent}%`;
      const visiblePercentage = percentage.slice(-available);
      const barWidth = Math.max(0, available - visiblePercentage.length);
      const cells = allocateSegmentCells(snapshot.categories, barWidth);
      const bar = CONTEXT_CATEGORY_ORDER.map((category) => {
        if (cells[category] === 0) return "";
        const glyph = category === "free" ? FREE_GLYPH : BAR_GLYPH;
        const text = glyph.repeat(cells[category]);
        if (category === "free") {
          return getEditorBorderStyle?.()?.(text)
            ?? theme.fg(CONTEXT_CATEGORY_COLORS.free, text);
        }
        return theme.fg(CONTEXT_CATEGORY_COLORS[category], text);
      }).join("");
      return [`${bar}${theme.fg("text", visiblePercentage)}`];
    },
    invalidate: () => {},
  };
}
