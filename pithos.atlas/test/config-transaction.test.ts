import assert from "node:assert/strict";
import { chmod, link, lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { commitConfig, readConfigSnapshot } from "../src/config-transaction.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe(".pithos configuration transaction", () => {
	it("atomically replaces the target inode instead of mutating it in place", async () => {
		const directory = await mkdtemp(join(tmpdir(), "atlas-config-"));
		temporaryDirectories.push(directory);
		const path = join(directory, ".pithos");
		const hardLink = join(directory, "original-link");
		const original = "pi:\n  version: 0.83.0\n";
		const staged = "pi:\n  version: 0.84.0\n";
		await writeFile(path, original);
		await link(path, hardLink);
		const snapshot = await readConfigSnapshot(path);

		assert.equal(await commitConfig(snapshot, staged), true);
		assert.equal(await readFile(path, "utf8"), staged);
		assert.equal(await readFile(hardLink, "utf8"), original);
	});

	it("preserves permissions and rejects symbolic-link targets", async () => {
		const directory = await mkdtemp(join(tmpdir(), "atlas-config-"));
		temporaryDirectories.push(directory);
		const path = join(directory, ".pithos");
		await writeFile(path, "pi: {}\n");
		await chmod(path, 0o640);
		const snapshot = await readConfigSnapshot(path);
		await commitConfig(snapshot, "pi:\n  version: 0.83.0\n");
		assert.equal((await lstat(path)).mode & 0o777, 0o640);

		const linkedPath = join(directory, ".pithos-link");
		await symlink(path, linkedPath);
		await assert.rejects(readConfigSnapshot(linkedPath), /regular file/);
	});

	it("atomically creates an absent target with private permissions", async () => {
		const directory = await mkdtemp(join(tmpdir(), "atlas-config-"));
		temporaryDirectories.push(directory);
		const path = join(directory, ".pithos");
		const snapshot = await readConfigSnapshot(path);

		assert.equal(await commitConfig(snapshot, "pi: {}\n"), true);
		assert.equal(await readFile(path, "utf8"), "pi: {}\n");
		assert.equal((await lstat(path)).mode & 0o777, 0o600);
	});

	it("cleans up staged files when the final safety guard fails", async () => {
		const directory = await mkdtemp(join(tmpdir(), "atlas-config-"));
		temporaryDirectories.push(directory);
		const path = join(directory, ".pithos");
		await writeFile(path, "original\n");
		const snapshot = await readConfigSnapshot(path);
		let guards = 0;

		await assert.rejects(commitConfig(snapshot, "staged\n", undefined, () => {
			guards += 1;
			if (guards === 2) throw new Error("safety changed");
		}), /safety changed/);
		assert.equal(await readFile(path, "utf8"), "original\n");
		assert.deepEqual((await readdir(directory)).sort(), [".pithos"]);
	});

	it("rejects a file created after Atlas observed an absent target", async () => {
		const directory = await mkdtemp(join(tmpdir(), "atlas-config-"));
		temporaryDirectories.push(directory);
		const path = join(directory, ".pithos");
		const snapshot = await readConfigSnapshot(path);
		await writeFile(path, "external\n");

		await assert.rejects(commitConfig(snapshot, "atlas\n"), /changed since Atlas opened it/);
		assert.equal(await readFile(path, "utf8"), "external\n");
	});

	it("rejects a concurrent content change inside the mutation queue", async () => {
		const directory = await mkdtemp(join(tmpdir(), "atlas-config-"));
		temporaryDirectories.push(directory);
		const path = join(directory, ".pithos");
		await writeFile(path, "pi:\n  version: 0.83.0\n");
		const snapshot = await readConfigSnapshot(path);
		await writeFile(path, "pi:\n  version: 0.84.0\n");
		const queuedPaths: string[] = [];

		await assert.rejects(
			commitConfig(snapshot, "pi:\n  version: 0.85.0\n", async (target, action) => {
				queuedPaths.push(target);
				return action();
			}),
			/changed since Atlas opened it/,
		);
		assert.deepEqual(queuedPaths, [path]);
		assert.equal(await readFile(path, "utf8"), "pi:\n  version: 0.84.0\n");
	});
});
