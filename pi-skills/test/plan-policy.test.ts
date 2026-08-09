import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectPlanModeTools } from "../extensions/plan-policy.ts";

function builtin(name: string) {
	return { name, sourceInfo: { source: "builtin", path: `<builtin:${name}>` } };
}

describe("selectPlanModeTools", () => {
	it("exposes only trusted read tools and the controlled plan writer", () => {
		const selected = selectPlanModeTools([
			builtin("read"),
			builtin("grep"),
			builtin("find"),
			builtin("ls"),
			builtin("write"),
			builtin("edit"),
			builtin("bash"),
			{ name: "guild_handover", sourceInfo: { source: "package", path: "/extensions/guild.ts" } },
		]);

		assert.deepEqual(selected, ["read", "grep", "find", "ls", "write"]);
	});
});
