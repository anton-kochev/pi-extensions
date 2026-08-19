import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlanPreview } from "../extensions/plan-preview.ts";

const theme = {
	bold: (text: string) => text,
	italic: (text: string) => text,
	strikethrough: (text: string) => text,
	underline: (text: string) => text,
	fg: (_color: string, text: string) => text,
};

const keybindings = {
	matches: (data: string, action: string) =>
		(action === "tui.select.confirm" && data === "enter") ||
		(action === "tui.select.cancel" && data === "escape") ||
		(action === "tui.select.up" && data === "up") ||
		(action === "tui.select.down" && data === "down") ||
		(action === "tui.select.pageUp" && data === "pageUp") ||
		(action === "tui.select.pageDown" && data === "pageDown"),
};

describe("PlanPreview", () => {
	it("defaults to continuing Plan mode instead of approving the draft", () => {
		const decisions: string[] = [];
		const preview = new PlanPreview({
			content: "# Plan: Preview drafts\n\n## Steps\n1. Show the exact plan.",
			planPath: ".pi/plans/example.md",
			terminalRows: () => 20,
			theme,
			keybindings,
			onDecision: (decision) => decisions.push(decision),
			onRender: () => {},
		});

		preview.handleInput("enter");

		assert.deepEqual(decisions, ["continue"]);
	});

	it("keeps a long draft bounded to the terminal and pages through it", () => {
		let renderRequests = 0;
		const content = ["# Plan: Long draft", ...Array.from({ length: 40 }, (_, index) => `${index + 1}. Step ${index + 1}`)].join("\n");
		const preview = new PlanPreview({
			content,
			planPath: ".pi/plans/long.md",
			terminalRows: () => 20,
			theme,
			keybindings,
			onDecision: () => {},
			onRender: () => renderRequests++,
		});

		const firstPage = preview.render(80);
		preview.handleInput("pageDown");
		const secondPage = preview.render(80);

		assert.equal(firstPage.length, 20);
		assert.equal(secondPage.length, 20);
		assert.match(firstPage.join("\n"), /Target: \.pi\/plans\/long\.md/);
		assert.match(firstPage.join("\n"), /Plan: Long draft/);
		assert.match(firstPage.join("\n"), /Draft lines 1–11 of/);
		assert.match(secondPage.join("\n"), /Draft lines 12–22 of/);
		assert.equal(renderRequests, 1);
	});

	it("renders model-supplied terminal controls as visible code-point markers", () => {
		const preview = new PlanPreview({
			content: "visible\u001b[2Jhidden\u202Ereordered\tstep",
			planPath: ".pi/plans/safe.md",
			terminalRows: () => 20,
			theme,
			keybindings,
			onDecision: () => {},
			onRender: () => {},
		});

		const output = preview.render(80).join("\n");

		assert.doesNotMatch(output, /\u001b|\u202E|\t/);
		assert.match(output, /U\+001B/);
		assert.match(output, /U\+202E/);
		assert.match(output, /U\+0009/);
	});

	it("uses a compact bounded layout in short terminals", () => {
		const preview = new PlanPreview({
			content: "# Plan: Compact draft\n\nFirst step\n\nSecond step",
			planPath: ".pi/plans/compact.md",
			terminalRows: () => 6,
			theme,
			keybindings,
			onDecision: () => {},
			onRender: () => {},
		});

		const lines = preview.render(80);

		assert.equal(lines.length, 6);
		assert.match(lines.join("\n"), /Target: \.pi\/plans\/compact\.md/);
		assert.match(lines.join("\n"), /Continue planning/);
		assert.match(lines.join("\n"), /Create plan and start implementation/);
	});

	it("fails safely when the terminal is too short to review", () => {
		const decisions: string[] = [];
		const preview = new PlanPreview({
			content: "# Plan: Hidden draft",
			planPath: ".pi/plans/example.md",
			terminalRows: () => 3,
			theme,
			keybindings,
			onDecision: (decision) => decisions.push(decision),
			onRender: () => {},
		});

		assert.equal(preview.render(80).length, 3);
		preview.handleInput("down");
		preview.handleInput("enter");

		assert.deepEqual(decisions, ["continue"]);
	});

	it("creates only after the user selects the explicit create action", () => {
		const decisions: string[] = [];
		const preview = new PlanPreview({
			content: "# Plan: Create reviewed draft",
			planPath: ".pi/plans/example.md",
			terminalRows: () => 20,
			theme,
			keybindings,
			onDecision: (decision) => decisions.push(decision),
			onRender: () => {},
		});

		preview.handleInput("down");
		preview.handleInput("enter");

		assert.deepEqual(decisions, ["create"]);
	});

	it("treats cancellation as continuing Plan mode", () => {
		const decisions: string[] = [];
		const preview = new PlanPreview({
			content: "# Plan: Cancel safely",
			planPath: ".pi/plans/example.md",
			terminalRows: () => 20,
			theme,
			keybindings,
			onDecision: (decision) => decisions.push(decision),
			onRender: () => {},
		});

		preview.handleInput("escape");

		assert.deepEqual(decisions, ["continue"]);
	});
});
