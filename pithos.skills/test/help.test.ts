import assert from "node:assert/strict";
import { describe, it } from "node:test";
import skillsHelp from "../extensions/help.ts";

function createHarness(hasUI = true) {
	const handlers = new Map<string, (event: any, ctx: any) => Promise<any>>();
	const notifications: Array<{ message: string; level: string }> = [];
	const pi = {
		on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
			handlers.set(name, handler);
		},
	};
	const ctx = {
		hasUI,
		ui: {
			notify(message: string, level: string) {
				notifications.push({ message, level });
			},
		},
	};
	skillsHelp(pi as never);
	return { handlers, notifications, ctx };
}

describe("Skills static help", () => {
	it("handles SRS and TDD --help/-h before resource expansion", async () => {
		for (const [command, usage] of [
			["/srs", "Usage: /srs <request>"],
			["/skill:tdd", "Usage: /skill:tdd [task context]"],
		] as const) {
			for (const alias of ["--help", "-h"]) {
				const harness = createHarness();
				const result = await harness.handlers.get("input")?.(
					{ source: "interactive", text: `${command} ${alias}` },
					harness.ctx,
				);

				assert.deepEqual(result, { action: "handled" });
				assert.equal(harness.notifications.length, 1);
				assert.equal(harness.notifications[0]?.level, "info");
				assert.match(harness.notifications[0]?.message ?? "", new RegExp(usage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
			}
		}
	});

	it("does not claim Plan help or normal resource invocations", async () => {
		for (const input of ["/plan --help", "/srs write an SRS", "/skill:tdd parser"]) {
			const harness = createHarness();
			const result = await harness.handlers.get("input")?.(
				{ source: "interactive", text: input },
				harness.ctx,
			);

			assert.deepEqual(result, { action: "continue" });
			assert.equal(harness.notifications.length, 0);
		}
	});

	it("ignores extension-injected input", async () => {
		const harness = createHarness();
		const result = await harness.handlers.get("input")?.(
			{ source: "extension", text: "/srs --help" },
			harness.ctx,
		);

		assert.deepEqual(result, { action: "continue" });
		assert.equal(harness.notifications.length, 0);
	});
});
