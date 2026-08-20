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

function instantiate(factory: any) {
	let selected: unknown;
	const component = factory(
		{ terminal: { rows: 20 }, requestRender() {} },
		theme,
		keybindings,
		(value: unknown) => {
			selected = value;
		},
	);
	return { component, selected: () => selected };
}

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
		assert.match(dialogs[0]?.[1] ?? "", /Target: `\.pi\/plans\/example\.md`/);
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

	it("uses Continue planning as the safe TUI default", async () => {
		const decision = await confirmPlanCreation(
			{
				mode: "tui",
				hasUI: true,
				ui: {
					confirm: async () => {
						throw new Error("TUI confirmation must use the compact chooser");
					},
					custom: async (factory: any) => {
						const { component, selected } = instantiate(factory);
						component.handleInput("enter");
						return selected();
					},
				},
			},
			".pi/plans/example.md",
			"# Plan: Safe confirmation",
		);

		assert.deepEqual(decision, { action: "continue" });
	});

	it("creates directly without opening the preview", async () => {
		let customCalls = 0;
		const decision = await confirmPlanCreation(
			{
				mode: "tui",
				hasUI: true,
				ui: {
					confirm: async () => false,
					custom: async (factory: any) => {
						customCalls += 1;
						const { component, selected } = instantiate(factory);
						component.render(80);
						component.handleInput("down");
						component.handleInput("down");
						component.handleInput("enter");
						return selected();
					},
				},
			},
			".pi/plans/example.md",
			"# Plan: Direct creation",
		);

		assert.deepEqual(decision, { action: "create" });
		assert.equal(customCalls, 1);
	});

	it("returns from a review-only preview to the identical confirmation choices", async () => {
		const screens: string[] = [];
		let customCalls = 0;
		const decision = await confirmPlanCreation(
			{
				mode: "tui",
				hasUI: true,
				ui: {
					confirm: async () => false,
					custom: async (factory: any) => {
						const { component, selected } = instantiate(factory);
						const output = component.render(80).join("\n");
						screens.push(output);
						customCalls += 1;
						if (customCalls === 1) {
							component.handleInput("down");
							component.handleInput("enter");
						} else if (customCalls === 2) {
							assert.match(output, /Plan: Review then create/);
							assert.doesNotMatch(output, /Create plan and start implementation/);
							component.handleInput("enter");
						} else {
							component.handleInput("down");
							component.handleInput("down");
							component.handleInput("enter");
						}
						return selected();
					},
				},
			},
			".pi/plans/example.md",
			"# Plan: Review then create",
		);

		assert.deepEqual(decision, { action: "create" });
		assert.equal(customCalls, 3);
		assert.equal(screens[0], screens[2]);
	});

	it("continues safely when interactive UI is unavailable", async () => {
		const decision = await confirmPlanCreation(
			{
				mode: "print",
				hasUI: false,
				ui: { confirm: async () => true },
			},
			".pi/plans/example.md",
			"# Plan: No UI",
		);

		assert.deepEqual(decision, { action: "continue" });
	});
});

describe("handleActivePlanCommand", () => {
	it("requests finalization without pre-authorizing an unseen draft", () => {
		const result = handleActivePlanCommand(".pi/plans/example.md");

		assert.equal(result.action, "transform");
		assert.match(result.text, /call create_plan/i);
		assert.match(result.text, /interactive confirmation/i);
		assert.match(result.text, /optional preview/i);
		assert.match(result.text, /`.pi\/plans\/example.md`/);
	});
});
