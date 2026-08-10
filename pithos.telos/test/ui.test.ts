import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { TaskListComponent } from "../src/ui";
import type { Task } from "../src/tasks";

const theme = {
	fg: (_name: string, value: string) => value,
} as Theme;

const labeledTheme = {
	fg: (name: string, value: string) => `<${name}>${value}</${name}>`,
} as Theme;

const tasks: Task[] = [
	makeTask("TSK-11111111", "First task"),
	makeTask("TSK-22222222", "Second task", { dependencies: ["TSK-11111111", "TSK-33333333"], notes: "private implementation notes" }),
	makeTask("TSK-33333333", "Third task"),
];

describe("interactive task list", () => {
	it("points at the selected task with a chevron", () => {
		const component = new TaskListComponent(tasks, theme, () => {});

		assert.deepEqual(taskRows(component), [
			"› □ TSK-11111111 ●○○ First task",
			"  □ TSK-22222222 ●○○ Second task  ◂2",
			"  □ TSK-33333333 ●○○ Third task",
		]);
	});

	it("moves the chevron with up and down keys", () => {
		let renderRequests = 0;
		const component = new TaskListComponent(tasks, theme, () => {}, () => renderRequests++);

		component.handleInput("\u001b[B");
		assert.deepEqual(taskRows(component), [
			"  □ TSK-11111111 ●○○ First task",
			"› □ TSK-22222222 ●○○ Second task  ◂2",
			"  □ TSK-33333333 ●○○ Third task",
		]);

		component.handleInput("\u001b[A");
		assert.deepEqual(taskRows(component), [
			"› □ TSK-11111111 ●○○ First task",
			"  □ TSK-22222222 ●○○ Second task  ◂2",
			"  □ TSK-33333333 ●○○ Third task",
		]);
		assert.equal(renderRequests, 2);
	});

	it("does not move beyond the first or last task", () => {
		let renderRequests = 0;
		const component = new TaskListComponent(tasks, theme, () => {}, () => renderRequests++);

		component.handleInput("\u001b[A");
		component.handleInput("\u001b[B");
		component.handleInput("\u001b[B");
		component.handleInput("\u001b[B");

		assert.deepEqual(taskRows(component), [
			"  □ TSK-11111111 ●○○ First task",
			"  □ TSK-22222222 ●○○ Second task  ◂2",
			"› □ TSK-33333333 ●○○ Third task",
		]);
		assert.equal(renderRequests, 2);
	});

	it("opens the selected task details with enter", () => {
		let renderRequests = 0;
		const component = new TaskListComponent(tasks, theme, () => {}, () => renderRequests++);

		component.handleInput("\u001b[B");
		component.handleInput("\r");

		const lines = component.render(120);
		assert.equal(lines[1], `${"─".repeat(3)} TSK-22222222 ${"─".repeat(103)}`);
		assert(lines.includes("  Second task"));
		assert(lines.includes("  □ todo · ●○○ medium"));
		assert(lines.includes("  Description"));
		assert(lines.includes("  private implementation notes"));
		assert(lines.includes("  Dependencies"));
		assert(lines.includes("  □ TSK-11111111  ●○○  First task"));
		assert(lines.includes("  □ TSK-33333333  ●○○  Third task"));
		assert(lines.includes("  Created  2026-06-04 00:00 UTC"));
		assert(lines.includes("  Updated  2026-06-04 00:00 UTC"));
		assert.equal(lines.some((line) => line.includes("Metadata")), false);
		assert.equal(lines.some((line) => line.includes("First task") && line.startsWith("  □") && !line.includes("TSK-11111111")), false);
		assert.equal(renderRequests, 2);
	});

	it("omits empty description and dependency sections in details", () => {
		const component = new TaskListComponent(tasks, theme, () => {});

		component.handleInput("\r");

		const lines = component.render(120);
		assert.equal(lines[1], `${"─".repeat(3)} TSK-11111111 ${"─".repeat(103)}`);
		assert.equal(lines.some((line) => line.includes("Description")), false);
		assert.equal(lines.some((line) => line.includes("Dependencies")), false);
	});

	it("colors detail labels as muted", () => {
		const component = new TaskListComponent([tasks[1]], labeledTheme, () => {});

		component.handleInput("\r");

		const lines = component.render(160);
		assert(lines.includes("  <muted>Description</muted>"));
		assert(lines.includes("  <muted>Dependencies</muted>"));
		assert(lines.includes("  <muted>Created</muted>  2026-06-04 00:00 UTC"));
		assert(lines.includes("  <muted>Updated</muted>  2026-06-04 00:00 UTC"));
	});

	it("wraps long descriptions without truncating them", () => {
		const description = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
		const component = new TaskListComponent([makeTask("TSK-44444444", "Long task", { notes: description })], theme, () => {});

		component.handleInput("\r");

		const descriptionLines = sectionLines(component.render(38), "  Description");
		assert(descriptionLines.length > 1);
		assert.equal(descriptionLines.some((line) => line.includes("…")), false);
		assert.equal(descriptionLines.map((line) => line.trim()).join(" "), description);
	});

	it("returns from task details to the list with space", () => {
		const component = new TaskListComponent(tasks, theme, () => {});

		component.handleInput("\r");
		component.handleInput(" ");

		assert.deepEqual(taskRows(component), [
			"› □ TSK-11111111 ●○○ First task",
			"  □ TSK-22222222 ●○○ Second task  ◂2",
			"  □ TSK-33333333 ●○○ Third task",
		]);
	});
});

function taskRows(component: TaskListComponent): string[] {
	return component.render(120).filter((line) => line.includes("TSK-"));
}

function sectionLines(lines: string[], heading: string): string[] {
	const start = lines.indexOf(heading);
	assert.notEqual(start, -1);

	const result: string[] = [];
	for (let index = start + 1; index < lines.length; index++) {
		if (lines[index] === "") break;
		result.push(lines[index]);
	}
	return result;
}

function makeTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
	return {
		id,
		title,
		status: "todo",
		priority: "medium",
		notes: "",
		dependencies: [],
		created: "2026-06-04T00:00:00.000Z",
		updated: "2026-06-04T00:00:00.000Z",
		...overrides,
	};
}
