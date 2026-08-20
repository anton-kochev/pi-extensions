import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { PlanPreview } from "../extensions/plan-preview.ts";

const theme = {
	bold: (text: string) => text,
	italic: (text: string) => text,
	strikethrough: (text: string) => text,
	underline: (text: string) => text,
	fg: (_color: string, text: string) => text,
};

const defaultKeys: Record<string, string[]> = {
	"tui.select.confirm": ["enter"],
	"tui.select.cancel": ["escape", "ctrl+c"],
	"tui.select.up": ["up"],
	"tui.select.down": ["down"],
	"tui.select.pageUp": ["pageUp"],
	"tui.select.pageDown": ["pageDown"],
};

const keybindings = {
	matches: (data: string, action: string) => defaultKeys[action]?.includes(data) ?? false,
	getKeys: (action: string) => defaultKeys[action] ?? [],
};

function createPreview(options: {
	content?: string;
	terminalRows?: number;
	closed?: string[];
	renders?: string[];
} = {}) {
	return new PlanPreview({
		content: options.content ?? "# Plan: Preview drafts\n\n## Steps\n1. Show the exact plan.",
		planPath: ".pi/plans/example.md",
		terminalRows: () => options.terminalRows ?? 20,
		theme,
		keybindings,
		onClose: () => options.closed?.push("closed"),
		onRender: () => options.renders?.push("render"),
	});
}

describe("PlanPreview", () => {
	it("returns to confirmation on Enter or Escape without approving", () => {
		for (const key of ["enter", "escape"]) {
			const closed: string[] = [];
			const preview = createPreview({ closed });

			preview.handleInput(key);

			assert.deepEqual(closed, ["closed"]);
		}
	});

	it("is review-only and does not render approval actions", () => {
		const output = createPreview().render(80).join("\n");

		assert.match(output, /Review plan draft/);
		assert.match(output, /Enter(?: or |\/)Esc.*confirmation/i);
		assert.doesNotMatch(output, /Continue planning/);
		assert.doesNotMatch(output, /Create plan and start implementation/);
	});

	it("scrolls a long draft one line with the arrow keys", () => {
		const renders: string[] = [];
		const content = ["# Plan: Long draft", ...Array.from({ length: 40 }, (_, index) => `${index + 1}. Step ${index + 1}`)].join("\n");
		const preview = createPreview({ content, renders });

		const first = preview.render(80).join("\n");
		preview.handleInput("down");
		const second = preview.render(80).join("\n");
		preview.handleInput("up");
		const returned = preview.render(80).join("\n");

		assert.match(first, /Draft lines 1–12 of/);
		assert.match(second, /Draft lines 2–13 of/);
		assert.match(returned, /Draft lines 1–12 of/);
		assert.equal(renders.length, 2);
	});

	it("supports page and boundary navigation", () => {
		const content = ["# Plan: Long draft", ...Array.from({ length: 40 }, (_, index) => `${index + 1}. Step ${index + 1}`)].join("\n");
		const preview = createPreview({ content });
		preview.render(80);

		preview.handleInput("pageDown");
		assert.match(preview.render(80).join("\n"), /Draft lines 13–24 of/);
		preview.handleInput("\u001b[F");
		assert.match(preview.render(80).join("\n"), /Draft lines 31–42 of 42/);
		preview.handleInput("\u001b[H");
		assert.match(preview.render(80).join("\n"), /Draft lines 1–12 of/);
		preview.handleInput("pageUp");
		assert.match(preview.render(80).join("\n"), /Draft lines 1–12 of/);
	});

	it("renders model-supplied terminal controls as visible code-point markers", () => {
		const output = createPreview({
			content: "visible\u001b[2Jhidden\u202Ereordered\tstep",
		}).render(80).join("\n");

		assert.doesNotMatch(output, /\u001b|\u202E|\t/);
		assert.match(output, /U\+001B/);
		assert.match(output, /U\+202E/);
		assert.match(output, /U\+0009/);
	});

	it("uses a compact bounded layout in short terminals", () => {
		const lines = createPreview({
			content: "# Plan: Compact draft\n\nFirst step\n\nSecond step",
			terminalRows: 6,
		}).render(80);
		const output = lines.join("\n");

		assert.equal(lines.length, 5);
		assert.match(output, /Target: \.pi\/plans\/example\.md/);
		assert.match(output, /Enter(?: or |\/)Esc.*confirmation/i);
		assert.doesNotMatch(output, /Create plan/);
	});

	it("stays bounded and can return when the terminal is extremely short", () => {
		const closed: string[] = [];
		const preview = createPreview({ terminalRows: 3, closed });

		assert.equal(preview.render(80).length, 2);
		preview.handleInput("enter");

		assert.deepEqual(closed, ["closed"]);
	});

	it("never renders past extremely narrow terminal widths", () => {
		const preview = createPreview({ content: "# Plan: Narrow\n\nA long preview line" });

		for (const width of [1, 2]) {
			const lines = preview.render(width);
			assert.ok(lines.length <= 19, `preview exceeded available rows at width ${width}`);
			assert.equal(
				lines.every((line) => visibleWidth(line) <= width),
				true,
				`preview exceeded width ${width}`,
			);
		}
	});

	it("describes configured review keys", () => {
		const configured = {
			matches: keybindings.matches,
			getKeys: (action: string) => ({
				"tui.select.confirm": ["return"],
				"tui.select.cancel": ["q"],
				"tui.select.up": ["k"],
				"tui.select.down": ["j"],
				"tui.select.pageUp": ["ctrl+u"],
				"tui.select.pageDown": ["ctrl+d"],
			}[action] ?? []),
		};
		const preview = new PlanPreview({
			content: "# Plan: Keys",
			planPath: ".pi/plans/example.md",
			terminalRows: () => 20,
			theme,
			keybindings: configured,
			onClose: () => {},
			onRender: () => {},
		});

		const output = preview.render(120).join("\n");
		const tinyPreview = new PlanPreview({
			content: "# Plan: Tiny keys",
			planPath: ".pi/plans/example.md",
			terminalRows: () => 3,
			theme,
			keybindings: configured,
			onClose: () => {},
			onRender: () => {},
		});
		const tinyOutput = tinyPreview.render(120).join("\n");

		assert.match(output, /Return\/q: confirmation.*k\/j line.*ctrl\+u\/ctrl\+d page/i);
		assert.match(tinyOutput, /Return\/q/i);
		assert.doesNotMatch(tinyOutput, /Enter or Esc/i);
	});
});
