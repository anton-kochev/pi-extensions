import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confirmPlanCreation, handleActivePlanCommand } from "../extensions/plan-exit.ts";

describe("confirmPlanCreation", () => {
	it("makes approval to create the plan authorize exiting and implementation", async () => {
		const dialogs: Array<[string, string]> = [];
		const ui = {
			confirm: async (title: string, message: string) => {
				dialogs.push([title, message]);
				return true;
			},
		};

		const decision = await confirmPlanCreation(ui, ".pi/plans/example.md");

		assert.deepEqual(dialogs, [
			[
				"Create plan and exit Plan mode",
				"Create the plan, exit read-only Plan mode, and begin implementation? Choose No to continue planning.",
			],
		]);
		assert.equal(decision.action, "create");
		if (decision.action === "create") {
			assert.match(decision.instruction, /call create_plan/i);
			assert.match(decision.instruction, /for `.pi\/plans\/example.md`/);
			assert.match(decision.instruction, /creation succeeds, implement the saved plan/);
			assert.doesNotMatch(decision.instruction, /Do not begin implementation/);
		}
	});

	it("authorizes the save while keeping Plan mode active until the write succeeds", async () => {
		let authorized = false;
		const result = await handleActivePlanCommand(
			{ confirm: async () => true },
			".pi/plans/example.md",
			() => {
				authorized = true;
			},
		);

		assert.deepEqual(result, {
			action: "transform",
			text: "Finalize the current plan and call create_plan with its complete Markdown content for `.pi/plans/example.md`. Once creation succeeds, implement the saved plan.",
		});
		assert.equal(authorized, true);
	});

	it("returns a continue-planning decision when the user declines to create a plan file", async () => {
		const ui = {
			confirm: async () => false,
		};

		const decision = await confirmPlanCreation(ui, ".pi/plans/example.md");

		assert.deepEqual(decision, { action: "continue" });
	});

	it("revokes save authorization and keeps Plan mode active when the user continues planning", async () => {
		let authorized = true;
		const result = await handleActivePlanCommand(
			{ confirm: async () => false },
			".pi/plans/example.md",
			(value) => {
				authorized = value;
			},
		);

		assert.deepEqual(result, { action: "handled" });
		assert.equal(authorized, false);
	});
});
