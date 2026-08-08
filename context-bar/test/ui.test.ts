import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
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

describe("createContextBarComponent", () => {
  it("renders used context as upper blocks and free capacity as the editor-border line", () => {
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
    };
    const component = createContextBarComponent(
      () => snapshot,
      theme as never,
      () => (text: string) => `<editorBorder>${text}</editorBorder>`,
    );

    assert.deepEqual(component.render(10), [
      "<customMessageLabel>▀</customMessageLabel>"
        + "<mdLink>▀</mdLink>"
        + "<accent>▀</accent>"
        + "<success>▀</success>"
        + "<mdHeading>▀</mdHeading>"
        + "<muted>▀</muted>"
        + "<editorBorder>─</editorBorder>"
        + "<text>86%</text>",
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
      assert.equal(component.render(width)[0]!.length, width);
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
    assert.match(status, /<customMessageLabel>▀ Prompt<\/customMessageLabel>.*≈10 tokens/);
    assert.match(status, /<editorBorder>─ Free<\/editorBorder>.*≈40 tokens/);
  });
});
