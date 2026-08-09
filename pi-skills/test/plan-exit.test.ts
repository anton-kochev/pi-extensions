import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confirmPlanExit, handlePlanExitCommand } from "../extensions/plan-exit.ts";

describe("confirmPlanExit", () => {
	it("requests a write to the generated plan path when the user confirms", async () => {
		const dialogs: Array<[string, string]> = [];
		const ui = {
			confirm: async (title: string, message: string) => {
				dialogs.push([title, message]);
				return true;
			},
		};

		const decision = await confirmPlanExit(ui, ".pi/plans/example.md");

		assert.deepEqual(dialogs, [["Exit Plan mode", "Create the plan file before exiting?"]]);
		assert.equal(decision.action, "save");
		if (decision.action === "save") {
			assert.match(decision.instruction, /write it to exactly `.pi\/plans\/example.md`/);
			assert.match(decision.instruction, /Do not begin implementation/);
		}
	});

	it("keeps Plan mode active while the confirmed save request runs", async () => {
		let cancelled = false;
		const result = await handlePlanExitCommand(
			{ confirm: async () => true },
			".pi/plans/example.md",
			() => {
				cancelled = true;
			},
		);

		assert.deepEqual(result, {
			action: "transform",
			text: "Finalize the current plan and write it to exactly `.pi/plans/example.md`. Do not begin implementation.",
		});
		assert.equal(cancelled, false);
	});

	it("returns a cancellation decision when the user declines to create a plan file", async () => {
		const ui = {
			confirm: async () => false,
		};

		const decision = await confirmPlanExit(ui, ".pi/plans/example.md");

		assert.deepEqual(decision, { action: "cancel" });
	});

	it("cancels immediately and handles the exit command when the user declines", async () => {
		let cancelled = false;
		const result = await handlePlanExitCommand(
			{ confirm: async () => false },
			".pi/plans/example.md",
			() => {
				cancelled = true;
			},
		);

		assert.deepEqual(result, { action: "handled" });
		assert.equal(cancelled, true);
	});
});
