import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTasksCommand } from "../src/commands";

describe("/tasks command parser", () => {
	it("parses create with options and quoted title", () => {
		assert.deepEqual(parseTasksCommand('create --priority high --notes "Needs care" "Build Telos"'), {
			type: "operation",
			operation: { action: "create", title: "Build Telos", priority: "high", notes: "Needs care" },
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
		assert.deepEqual(parseTasksCommand("complete TSK-0001"), {
			type: "operation",
			operation: { action: "complete", id: "TSK-0001" },
		});
	});

	it("reports invalid command arguments", () => {
		const parsed = parseTasksCommand("update TSK-0001 --unknown value");
		assert.equal(parsed.type, "error");
		assert.match(parsed.message, /Unknown/);
	});
});
