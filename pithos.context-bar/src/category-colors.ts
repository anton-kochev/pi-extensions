import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ContextCategory } from "./context-model.ts";

type UsedContextCategory = Exclude<ContextCategory, "free">;
type RgbColor = Readonly<{ r: number; g: number; b: number }>;
type ContextPalette = Readonly<Record<UsedContextCategory, RgbColor>>;

const LIGHT_BACKGROUND_PALETTE: ContextPalette = {
  prompt: { r: 145, g: 79, b: 207 },
  project: { r: 52, g: 124, b: 200 },
  skills: { r: 27, g: 145, b: 138 },
  tools: { r: 103, g: 144, b: 55 },
  conversation: { r: 187, g: 113, b: 18 },
  other: { r: 126, g: 134, b: 147 },
};

const DARK_BACKGROUND_PALETTE: ContextPalette = {
  prompt: { r: 199, g: 125, b: 255 },
  project: { r: 92, g: 169, b: 230 },
  skills: { r: 53, g: 194, b: 178 },
  tools: { r: 156, g: 204, b: 101 },
  conversation: { r: 255, g: 209, b: 102 },
  other: { r: 156, g: 163, b: 175 },
};

const BASIC_ANSI_RGB: readonly RgbColor[] = [
  { r: 0, g: 0, b: 0 },
  { r: 128, g: 0, b: 0 },
  { r: 0, g: 128, b: 0 },
  { r: 128, g: 128, b: 0 },
  { r: 0, g: 0, b: 128 },
  { r: 128, g: 0, b: 128 },
  { r: 0, g: 128, b: 128 },
  { r: 192, g: 192, b: 192 },
  { r: 128, g: 128, b: 128 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 255, g: 0, b: 255 },
  { r: 0, g: 255, b: 255 },
  { r: 255, g: 255, b: 255 },
];
const CUBE_VALUES = [0, 95, 135, 175, 215, 255] as const;
const LIGHT_BACKGROUND_FOREGROUND_MAX_LUMINANCE = 0.24;

function xtermIndexToRgb(index: number): RgbColor | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 255) return undefined;
  if (index < 16) return BASIC_ANSI_RGB[index];
  if (index < 232) {
    const offset = index - 16;
    return {
      r: CUBE_VALUES[Math.floor(offset / 36)]!,
      g: CUBE_VALUES[Math.floor((offset % 36) / 6)]!,
      b: CUBE_VALUES[offset % 6]!,
    };
  }
  const gray = 8 + (index - 232) * 10;
  return { r: gray, g: gray, b: gray };
}

function parseForegroundAnsi(ansi: string): RgbColor | undefined {
  const rgb = /38;2;(\d+);(\d+);(\d+)m/.exec(ansi);
  if (rgb) {
    const [r, g, b] = rgb.slice(1).map(Number);
    if ([r, g, b].every((channel) => channel >= 0 && channel <= 255)) return { r, g, b };
  }
  const indexed = /38;5;(\d+)m/.exec(ansi);
  return indexed ? xtermIndexToRgb(Number(indexed[1])) : undefined;
}

function channelLuminance(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: RgbColor): number {
  return 0.2126 * channelLuminance(color.r)
    + 0.7152 * channelLuminance(color.g)
    + 0.0722 * channelLuminance(color.b);
}

function usesLightBackground(theme: Theme): boolean {
  for (const anchor of ["text", "accent", "muted", "dim"] as const) {
    try {
      const foreground = parseForegroundAnsi(theme.getFgAnsi(anchor));
      if (foreground) {
        return relativeLuminance(foreground) < LIGHT_BACKGROUND_FOREGROUND_MAX_LUMINANCE;
      }
    } catch {
      // Try the next public foreground token when this one is unavailable.
    }
  }
  return theme.name?.toLowerCase().includes("light") ?? false;
}

function colorDistance(left: RgbColor, right: RgbColor): number {
  const red = left.r - right.r;
  const green = left.g - right.g;
  const blue = left.b - right.b;
  return red * red * 0.299 + green * green * 0.587 + blue * blue * 0.114;
}

function rgbToXtermIndex(color: RgbColor): number {
  let closestIndex = 16;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 16; index <= 255; index++) {
    const candidate = xtermIndexToRgb(index)!;
    const distance = colorDistance(color, candidate);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }
  return closestIndex;
}

export function colorizeContextCategory(
  theme: Theme,
  category: UsedContextCategory,
  text: string,
): string {
  const palette = usesLightBackground(theme) ? LIGHT_BACKGROUND_PALETTE : DARK_BACKGROUND_PALETTE;
  const color = palette[category];
  let mode: "truecolor" | "256color" = "truecolor";
  try {
    mode = theme.getColorMode();
  } catch {
    // Test doubles and older compatible theme objects default to truecolor.
  }
  const foreground = mode === "256color"
    ? `\u001b[38;5;${rgbToXtermIndex(color)}m`
    : `\u001b[38;2;${color.r};${color.g};${color.b}m`;
  return `${foreground}${text}\u001b[39m`;
}
