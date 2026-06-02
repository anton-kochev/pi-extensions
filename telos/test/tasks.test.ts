import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyTaskOperation, createEmptyArtifact, type TaskArtifact } from "../src/tasks";

const now1 = () => new Date("2026-06-02T12:00:00.000Z");
const now2 = () => new Date("2026-06-02T13:00:00.000Z");

function createdArtifact(): TaskArtifact {
	return applyTaskOperation(createEmptyArtifact(), { action: "create", title: "Write tests" }, now1).artifact;
}

describe("task operations", () => {
	it("creates tasks with stable sequence IDs, defaults, ISO timestamps, and empty notes", () => {
		const first = applyTaskOperation(createEmptyArtifact(), { action: "create", title: "Write tests" }, now1);
		const second = applyTaskOperation(first.artifact, { action: "create", title: "Implement Telos", priority: "high" }, now2);

		assert.equal(first.task?.id, "TSK-0001");
		assert.equal(first.task?.status, "todo");
		assert.equal(first.task?.priority, "medium");
		assert.equal(first.task?.notes, "");
		assert.equal(first.task?.created, "2026-06-02T12:00:00.000Z");
		assert.equal(first.task?.updated, "2026-06-02T12:00:00.000Z");
		assert.equal(second.task?.id, "TSK-0002");
		assert.equal(second.task?.priority, "high");
	});

	it("updates only requested fields while preserving id and created timestamp", () => {
		const artifact = createdArtifact();
		const result = applyTaskOperation(artifact, { action: "update", id: "TSK-0001", notes: "Some notes" }, now2);

		const task = result.task!;
		assert.equal(task.id, "TSK-0001");
		assert.equal(task.title, "Write tests");
		assert.equal(task.priority, "medium");
		assert.equal(task.notes, "Some notes");
		assert.equal(task.created, "2026-06-02T12:00:00.000Z");
		assert.equal(task.updated, "2026-06-02T13:00:00.000Z");
	});

	it("supports lifecycle status changes and archived filtering", () => {
		let artifact = createdArtifact();
		artifact = applyTaskOperation(artifact, { action: "create", title: "Keep active" }, now1).artifact;
		artifact = applyTaskOperation(artifact, { action: "archive", id: "TSK-0001" }, now2).artifact;

		const active = applyTaskOperation(artifact, { action: "list" }, now2);
		const archived = applyTaskOperation(artifact, { action: "list", scope: "archived" }, now2);
		const all = applyTaskOperation(artifact, { action: "list", scope: "all" }, now2);

		assert.deepEqual(active.tasks?.map((task) => task.id), ["TSK-0002"]);
		assert.deepEqual(archived.tasks?.map((task) => task.id), ["TSK-0001"]);
		assert.deepEqual(all.tasks?.map((task) => task.id), ["TSK-0001", "TSK-0002"]);
	});

	it("rejects physical delete without removing the task", () => {
		const artifact = createdArtifact();
		const result = applyTaskOperation(artifact, { action: "delete", id: "TSK-0001" }, now2);

		assert.equal(result.artifact.tasks.length, 1);
		assert.equal(result.artifact.tasks[0].status, "todo");
		assert.match(result.text, /not supported/i);
	});

	it("rejects invalid priority without mutating the original artifact", () => {
		const artifact = createdArtifact();
		assert.throws(
			() => applyTaskOperation(artifact, { action: "update", id: "TSK-0001", priority: "extreme" as never }, now2),
			/Invalid priority/,
		);
		assert.equal(artifact.tasks[0].priority, "medium");
		assert.equal(artifact.tasks[0].updated, "2026-06-02T12:00:00.000Z");
	});
});
