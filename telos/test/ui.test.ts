import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { TaskListComponent } from "../src/ui";
import type { Task } from "../src/tasks";

const theme = {
	fg: (_name: string, value: string) => value,
} as Theme;

const tasks: Task[] = [
	makeTask("TSK-11111111", "First task"),
	makeTask("TSK-22222222", "Second task"),
	makeTask("TSK-33333333", "Third task"),
];

describe("interactive task list", () => {
	it("points at the selected task with a chevron", () => {
		const component = new TaskListComponent(tasks, theme, () => {});

		assert.deepEqual(taskRows(component), [
			"› □ TSK-11111111 ●○○ First task",
			"  □ TSK-22222222 ●○○ Second task",
			"  □ TSK-33333333 ●○○ Third task",
		]);
	});

	it("moves the chevron with up and down keys", () => {
		let renderRequests = 0;
		const component = new TaskListComponent(tasks, theme, () => {}, () => renderRequests++);

		component.handleInput("\u001b[B");
		assert.deepEqual(taskRows(component), [
			"  □ TSK-11111111 ●○○ First task",
			"› □ TSK-22222222 ●○○ Second task",
			"  □ TSK-33333333 ●○○ Third task",
		]);

		component.handleInput("\u001b[A");
		assert.deepEqual(taskRows(component), [
			"› □ TSK-11111111 ●○○ First task",
			"  □ TSK-22222222 ●○○ Second task",
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
			"  □ TSK-22222222 ●○○ Second task",
			"› □ TSK-33333333 ●○○ Third task",
		]);
		assert.equal(renderRequests, 2);
	});
});

function taskRows(component: TaskListComponent): string[] {
	return component.render(120).filter((line) => line.includes("TSK-"));
}

function makeTask(id: string, title: string): Task {
	return {
		id,
		title,
		status: "todo",
		priority: "medium",
		notes: "",
		dependencies: [],
		created: "2026-06-04T00:00:00.000Z",
		updated: "2026-06-04T00:00:00.000Z",
	};
}
