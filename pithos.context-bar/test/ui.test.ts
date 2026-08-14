import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { colorizeContextCategory } from "../src/category-colors.ts";
import {
  allocateSegmentCells,
  createContextBarComponent,
  formatContextStatus,
  withoutTopEditorBorder,
} from "../src/ui.ts";

const categories = {
  prompt: 1,
  project: 1,
  skills: 0,
  tools: 0,
  conversation: 0,
  other: 0,
  free: 2,
};

describe("allocateSegmentCells", () => {
  it("uses deterministic largest-remainder allocation in category order", () => {
    assert.deepEqual(allocateSegmentCells(categories, 3), {
      prompt: 1,
      project: 1,
      skills: 0,
      tools: 0,
      conversation: 0,
      other: 0,
      free: 1,
    });
  });

  it("does not exaggerate categories that are smaller than one cell", () => {
    assert.deepEqual(allocateSegmentCells({ ...categories, prompt: 0.1, project: 0, free: 99.9 }, 10), {
      prompt: 0,
      project: 0,
      skills: 0,
      tools: 0,
      conversation: 0,
      other: 0,
      free: 10,
    });
  });
});

describe("context category colors", () => {
  it("uses brighter variants of the same hue sequence on dark backgrounds", () => {
    const theme = {
      getFgAnsi: () => "\u001b[38;2;231;225;213m",
      getColorMode: () => "truecolor",
    } as never;

    assert.deepEqual([
      colorizeContextCategory(theme, "prompt", "▀"),
      colorizeContextCategory(theme, "project", "▀"),
      colorizeContextCategory(theme, "skills", "▀"),
      colorizeContextCategory(theme, "tools", "▀"),
      colorizeContextCategory(theme, "conversation", "▀"),
      colorizeContextCategory(theme, "other", "▀"),
    ], [
      "\u001b[38;2;199;125;255m▀\u001b[39m",
      "\u001b[38;2;92;169;230m▀\u001b[39m",
      "\u001b[38;2;53;194;178m▀\u001b[39m",
      "\u001b[38;2;156;204;101m▀\u001b[39m",
      "\u001b[38;2;255;209;102m▀\u001b[39m",
      "\u001b[38;2;156;163;175m▀\u001b[39m",
    ]);
  });

  it("keeps adjacent sections visually distinct in both contrast variants", () => {
    const categories = ["prompt", "project", "skills", "tools", "conversation", "other"] as const;
    const themes = [
      {
        getFgAnsi: () => "\u001b[38;2;38;56;61m",
        getColorMode: () => "truecolor",
      },
      {
        getFgAnsi: () => "\u001b[38;2;231;225;213m",
        getColorMode: () => "truecolor",
      },
    ] as const;

    for (const theme of themes) {
      const colors = categories.map((category) => {
        const rendered = colorizeContextCategory(theme as never, category, "▀");
        const match = /38;2;(\d+);(\d+);(\d+)m/.exec(rendered)!;
        return match.slice(1).map(Number);
      });
      for (let index = 1; index < colors.length; index++) {
        const previous = colors[index - 1]!;
        const current = colors[index]!;
        const distance = Math.hypot(
          current[0]! - previous[0]!,
          current[1]! - previous[1]!,
          current[2]! - previous[2]!,
        );
        assert.ok(distance >= 68, `${categories[index - 1]} and ${categories[index]} are too similar`);
      }
    }
  });

  it("keeps the light-background palette bright without losing hue separation", () => {
    const theme = {
      getFgAnsi: () => "\u001b[38;2;38;56;61m",
      getColorMode: () => "truecolor",
    } as never;
    const categories = ["prompt", "project", "skills", "tools", "conversation", "other"] as const;
    const luminance = categories.map((category) => {
      const rendered = colorizeContextCategory(theme, category, "▀");
      const match = /38;2;(\d+);(\d+);(\d+)m/.exec(rendered)!;
      const channels = match.slice(1).map(Number).map((channel) => {
        const srgb = channel / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    });

    const averageLuminance = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
    assert.ok(averageLuminance >= 0.2);
  });

  it("recognizes moderately bright text as a dark-background theme", () => {
    const theme = {
      getFgAnsi: () => "\u001b[38;2;171;178;191m",
      getColorMode: () => "truecolor",
    } as never;

    assert.equal(
      colorizeContextCategory(theme, "prompt", "▀"),
      "\u001b[38;2;199;125;255m▀\u001b[39m",
    );
  });

  it("uses another foreground anchor when theme text uses the terminal default", () => {
    const theme = {
      getFgAnsi: (color: string) => color === "text"
        ? "\u001b[39m"
        : "\u001b[38;2;77;95;99m",
      getColorMode: () => "truecolor",
    } as never;

    assert.equal(
      colorizeContextCategory(theme, "prompt", "▀"),
      "\u001b[38;2;145;79;207m▀\u001b[39m",
    );
  });

  it("keeps category colors distinct in 256-color terminals", () => {
    const theme = {
      getFgAnsi: () => "\u001b[38;5;255m",
      getColorMode: () => "256color",
    } as never;
    const rendered = (["prompt", "project", "skills", "tools", "conversation", "other"] as const)
      .map((category) => colorizeContextCategory(theme, category, "▀"));

    assert.ok(rendered.every((segment) => /^\u001b\[38;5;\d+m▀\u001b\[39m$/.test(segment)));
    assert.equal(new Set(rendered).size, rendered.length);
  });
});

describe("createContextBarComponent", () => {
  it("preserves the original harmonious hue sequence under a light theme", () => {
    const snapshot = {
      categories: {
        prompt: 10,
        project: 10,
        skills: 10,
        tools: 10,
        conversation: 10,
        other: 10,
        free: 10,
      },
      tokens: 60,
      contextWindow: 70,
      percent: 86,
      basis: "local-estimate" as const,
    };
    const theme = {
      fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
      getFgAnsi: (color: string) => color === "text" ? "\u001b[38;2;38;56;61m" : "\u001b[38;2;112;82;0m",
      getColorMode: () => "truecolor",
    };
    const component = createContextBarComponent(
      () => snapshot,
      theme as never,
      () => (text: string) => `<editorBorder>${text}</editorBorder>`,
    );

    assert.deepEqual(component.render(10), [
      "\u001b[38;2;145;79;207m▀\u001b[39m"
        + "\u001b[38;2;52;124;200m▀\u001b[39m"
        + "\u001b[38;2;27;145;138m▀\u001b[39m"
        + "\u001b[38;2;103;144;55m▀\u001b[39m"
        + "\u001b[38;2;187;113;18m▀\u001b[39m"
        + "\u001b[38;2;126;134;147m▀\u001b[39m"
        + "<editorBorder>─</editorBorder>"
        + "<dim>86%</dim>",
    ]);
  });

  it("uses background-colored cell delimiters between visible sections", () => {
    const snapshot = {
      categories: {
        prompt: 1,
        project: 1,
        skills: 0,
        tools: 0,
        conversation: 0,
        other: 0,
        free: 2,
      },
      tokens: 2,
      contextWindow: 4,
      percent: 50,
      basis: "local-estimate" as const,
    };
    const theme = {
      fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
      getFgAnsi: () => "\u001b[38;2;38;56;61m",
      getColorMode: () => "truecolor",
    };
    const component = createContextBarComponent(
      () => snapshot,
      theme as never,
      () => (text: string) => `<editorBorder>${text}</editorBorder>`,
    );

    assert.deepEqual(component.render(10), [
      "\u001b[38;2;145;79;207m▀\u001b[39m "
        + "\u001b[38;2;52;124;200m▀\u001b[39m "
        + "<editorBorder>───</editorBorder>"
        + "<dim>50%</dim>",
    ]);
  });

  it("keeps section interiors uninterrupted and shows only the total percentage", () => {
    const snapshot = {
      categories: {
        prompt: 10,
        project: 0,
        skills: 0,
        tools: 0,
        conversation: 0,
        other: 0,
        free: 7,
      },
      tokens: 10,
      contextWindow: 17,
      percent: 59,
      basis: "local-estimate" as const,
    };
    const theme = {
      fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
      getFgAnsi: () => "\u001b[38;2;38;56;61m",
      getColorMode: () => "truecolor",
    };
    const component = createContextBarComponent(
      () => snapshot,
      theme as never,
      () => (text: string) => `<editorBorder>${text}</editorBorder>`,
    );

    assert.deepEqual(component.render(20), [
      "\u001b[38;2;145;79;207m▀▀▀▀▀▀▀▀▀\u001b[39m "
        + "<editorBorder>───────</editorBorder>"
        + "<dim>59%</dim>",
    ]);
  });

  it("keeps ANSI-colored output at the exact terminal-visible width", () => {
    const snapshot = {
      categories: {
        prompt: 10,
        project: 10,
        skills: 10,
        tools: 10,
        conversation: 10,
        other: 10,
        free: 40,
      },
      tokens: 60,
      contextWindow: 100,
      percent: 60,
      basis: "local-estimate" as const,
    };
    const component = createContextBarComponent(
      () => snapshot,
      { fg: (_color: string, text: string) => `\u001b[38;5;75m${text}\u001b[0m` } as never,
    );

    for (let width = 0; width <= 120; width++) {
      assert.equal(visibleWidth(component.render(width)[0]!), width);
    }
  });

  it("uses exactly the available width across zero, narrow, and overflow states", () => {
    const snapshot = {
      categories: {
        prompt: 104,
        project: 0,
        skills: 0,
        tools: 0,
        conversation: 0,
        other: 0,
        free: 0,
      },
      tokens: 104,
      contextWindow: 100,
      percent: 104,
      basis: "provider-backed" as const,
    };
    const component = createContextBarComponent(
      () => snapshot,
      { fg: (_color: string, text: string) => text } as never,
    );

    for (let width = 0; width <= 12; width++) {
      assert.equal(visibleWidth(component.render(width)[0]!), width);
    }
    assert.ok(component.render(12)[0]!.endsWith("104%"));
    assert.equal(component.render(2)[0], "4%");
  });
});

describe("withoutTopEditorBorder", () => {
  it("removes the editor top border so the widget directly precedes input", () => {
    const editor = {
      render: (_width: number) => ["\u001b[35m────────\u001b[0m", "input", "────────"],
      invalidate: () => {},
      getText: () => "",
      setText: (_text: string) => {},
      handleInput: (_data: string) => {},
    };

    assert.deepEqual(withoutTopEditorBorder(editor).render(8), ["input", "────────"]);
  });

  it("preserves a custom editor when its first row is not a border", () => {
    const editor = {
      render: (_width: number) => ["custom input", "help"],
      invalidate: () => {},
      getText: () => "",
      setText: (_text: string) => {},
      handleInput: (_data: string) => {},
    };

    assert.deepEqual(withoutTopEditorBorder(editor).render(12), ["custom input", "help"]);
  });
});

describe("formatContextStatus", () => {
  it("shows state, model, basis, and the ordered colored legend without raw context", () => {
    const snapshot = {
      categories: {
        prompt: 10,
        project: 10,
        skills: 10,
        tools: 10,
        conversation: 10,
        other: 10,
        free: 40,
      },
      tokens: 60,
      contextWindow: 100,
      percent: 60,
      basis: "provider-backed" as const,
      model: { provider: "openai", id: "gpt-test" },
    };
    const theme = {
      fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
      getFgAnsi: (color: string) => color === "text" ? "\u001b[38;2;38;56;61m" : "\u001b[38;2;112;82;0m",
      getColorMode: () => "truecolor",
    };

    const status = formatContextStatus(
      snapshot,
      true,
      theme as never,
      (text: string) => `<editorBorder>${text}</editorBorder>`,
    );

    assert.match(status, /context-bar is on/);
    assert.match(status, /openai\/gpt-test · 60 \/ 100 tokens · 60% · provider-backed total/);
    const labels = ["Prompt", "Project context", "Skills", "Tools", "Conversation", "Other", "Free"];
    for (let index = 1; index < labels.length; index++) {
      assert.ok(status.indexOf(labels[index - 1]!) < status.indexOf(labels[index]!));
    }
    assert.match(status, /\u001b\[38;2;145;79;207m▀ Prompt\u001b\[39m.*≈10 tokens/);
    assert.match(status, /\u001b\[38;2;52;124;200m▀ Project context\u001b\[39m/);
    assert.match(status, /\u001b\[38;2;27;145;138m▀ Skills\u001b\[39m/);
    assert.match(status, /\u001b\[38;2;103;144;55m▀ Tools\u001b\[39m/);
    assert.match(status, /\u001b\[38;2;187;113;18m▀ Conversation\u001b\[39m/);
    assert.match(status, /\u001b\[38;2;126;134;147m▀ Other\u001b\[39m/);
    assert.match(status, /<editorBorder>─ Free<\/editorBorder>.*≈40 tokens/);
  });
});
