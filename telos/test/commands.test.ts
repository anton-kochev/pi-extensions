import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTasksCommand } from "../src/commands";

describe("/tasks command parser", () => {
	it("parses create with options and quoted title", () => {
		assert.deepEqual(parseTasksCommand('create --priority high --notes "Needs care" --depends TSK-abc123ef,TSK-fed456ba "Build Telos"'), {
			type: "operation",
			operation: {
				action: "create",
				title: "Build Telos",
				priority: "high",
				notes: "Needs care",
				dependencies: ["TSK-abc123ef", "TSK-fed456ba"],
			},
		});
	});

	it("parses list scopes", () => {
		assert.deepEqual(parseTasksCommand("list --archived"), {
			type: "operation",
			operation: { action: "list", scope: "archived" },
		});
		assert.deepEqual(parseTasksCommand("list --all"), {
			type: "operation",
			operation: { action: "list", scope: "all" },
		});
	});

	it("parses lifecycle shortcuts", () => {
		assert.deepEqual(parseTasksCommand("complete TSK-abc123ef"), {
			type: "operation",
			operation: { action: "complete", id: "TSK-abc123ef" },
		});
	});

	it("reports invalid command arguments", () => {
		const parsed = parseTasksCommand("update TSK-abc123ef --unknown value");
		assert.equal(parsed.type, "error");
		assert.match(parsed.message, /Unknown/);
	});
});
