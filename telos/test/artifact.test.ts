import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
	loadTaskArtifact,
	mutateTaskArtifact,
	parseArtifactText,
	serializeArtifact,
	taskFilePath,
} from "../src/artifact";
import { createEmptyArtifact } from "../src/tasks";

const tempDirs: string[] = [];
const now = () => new Date("2026-06-02T12:00:00.000Z");

async function tempFile() {
	const dir = await mkdtemp(join(tmpdir(), "telos-test-"));
	tempDirs.push(dir);
	return join(dir, "telos-tasks.md");
}

after(async () => {
	for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

describe("Telos task artifact", () => {
	it("stores the task artifact under the .pi directory", () => {
		assert.equal(taskFilePath("/repo"), join("/repo", ".pi", "telos-tasks.md"));
	});

	it("serializes and parses YAML frontmatter as the canonical task data", () => {
		const artifact = createEmptyArtifact();
		const created = {
			...artifact,
			tasks: [
				{
					id: "TSK-abc123ef",
					title: "Write tests",
					status: "todo" as const,
					priority: "medium" as const,
					notes: "",
					dependencies: [],
					created: "2026-06-02T12:00:00.000Z",
					updated: "2026-06-02T12:00:00.000Z",
				},
			],
		};

		const text = serializeArtifact(created);
		assert.match(text, /^---\n/);
		assert.match(text, /telos_version: 1/);
		assert.match(text, /# Tasks/);
		assert.deepEqual(parseArtifactText(text), created);
	});

	it("rejects files without Telos frontmatter", () => {
		assert.throws(() => parseArtifactText("# Tasks\n\nNo frontmatter"), /Telos YAML frontmatter/);
	});

	it("creates a missing task artifact on successful mutation", async () => {
		const file = await tempFile();
		const result = await mutateTaskArtifact(file, { action: "create", title: "Write tests" }, now, () => "abc123ef");
		const written = await readFile(file, "utf8");

		assert.equal(result.task?.id, "TSK-abc123ef");
		assert.match(written, /telos_version: 1/);
		assert.match(written, /title: Write tests/);
		assert.match(written, /dependencies:\s*\[\]/);
	});

	it("leaves malformed artifacts unchanged when mutation validation fails", async () => {
		const file = await tempFile();
		const malformed = "---\ntelos_version: nope\ntasks: []\n---\n\n# Tasks\n";
		await writeFile(file, malformed, "utf8");

		await assert.rejects(
			() => mutateTaskArtifact(file, { action: "create", title: "Should not write" }, now),
			/telos_version/,
		);
		assert.equal(await readFile(file, "utf8"), malformed);
	});

	it("loads a missing artifact as an empty task list without creating a file", async () => {
		const file = await tempFile();
		const loaded = await loadTaskArtifact(file);

		assert.equal(loaded.existed, false);
		assert.deepEqual(loaded.artifact, createEmptyArtifact());
	});
});
