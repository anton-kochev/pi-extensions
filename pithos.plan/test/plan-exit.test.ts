import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confirmPlanCreation, handleActivePlanCommand } from "../extensions/plan-exit.ts";

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

describe("confirmPlanCreation", () => {
	it("includes the exact draft in RPC approval", async () => {
		const dialogs: Array<[string, string]> = [];
		const context = {
			mode: "rpc" as const,
			hasUI: true,
			ui: {
				confirm: async (title: string, message: string) => {
					dialogs.push([title, message]);
					return true;
				},
			},
		};
		const content = "# Plan: Preview drafts\n\nExact RPC draft.";

		const decision = await confirmPlanCreation(context, ".pi/plans/example.md", content);

		assert.equal(decision.action, "create");
		assert.equal(dialogs.length, 1);
		assert.match(dialogs[0]?.[0] ?? "", /review plan draft/i);
		assert.match(dialogs[0]?.[1] ?? "", /Target: `.pi\/plans\/example.md`/);
		assert.match(dialogs[0]?.[1] ?? "", /# Plan: Preview drafts\n\nExact RPC draft\./);
	});

	it("continues planning when RPC approval is declined", async () => {
		const decision = await confirmPlanCreation(
			{
				mode: "rpc",
				hasUI: true,
				ui: { confirm: async () => false },
			},
			".pi/plans/example.md",
			"# Plan: Keep planning",
		);

		assert.deepEqual(decision, { action: "continue" });
	});

	it("uses the safe default in the TUI reviewer", async () => {
		const decision = await confirmPlanCreation(
			{
				mode: "tui",
				hasUI: true,
				ui: {
					confirm: async () => {
						throw new Error("TUI review must not use the plain confirmation");
					},
					custom: async (factory: any) => {
						let selected: string | undefined;
						const component = factory(
							{ terminal: { rows: 20 }, requestRender() {} },
							theme,
							keybindings,
							(value: string) => {
								selected = value;
							},
						);
						component.handleInput("enter");
						return selected;
					},
				},
			},
			".pi/plans/example.md",
			"# Plan: Safe review",
		);

		assert.deepEqual(decision, { action: "continue" });
	});
});

describe("handleActivePlanCommand", () => {
	it("requests finalization without pre-authorizing an unseen draft", () => {
		const result = handleActivePlanCommand(".pi/plans/example.md");

		assert.equal(result.action, "transform");
		assert.match(result.text, /call create_plan/i);
		assert.match(result.text, /show the exact draft for approval/i);
		assert.match(result.text, /`.pi\/plans\/example.md`/);
	});
});
