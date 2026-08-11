import { link, lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

const MAX_CONFIG_BYTES = 1024 * 1024;

export interface ConfigSnapshot {
	path: string;
	exists: boolean;
	content: string;
	mode?: number;
}

export type MutationQueue = <T>(path: string, action: () => Promise<T>) => Promise<T>;

function isMissing(error: unknown): boolean {
	return !!error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === "ENOENT";
}

export async function readConfigSnapshot(path: string): Promise<ConfigSnapshot> {
	try {
		const stats = await lstat(path);
		if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(".pithos must be a regular file, not a link or special file");
		if (stats.size > MAX_CONFIG_BYTES) throw new Error(".pithos is too large for Atlas to manage");
		const content = await readFile(path, "utf8");
		if (Buffer.byteLength(content, "utf8") > MAX_CONFIG_BYTES) throw new Error(".pithos is too large for Atlas to manage");
		return { path, exists: true, content, mode: stats.mode & 0o777 };
	} catch (error) {
		if (isMissing(error)) return { path, exists: false, content: "" };
		throw error;
	}
}

async function removeIfPresent(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (error) {
		if (!isMissing(error)) throw error;
	}
}

async function syncDirectory(path: string): Promise<void> {
	const handle = await open(path, "r");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

export async function commitConfig(
	snapshot: ConfigSnapshot,
	stagedContent: string,
	queue: MutationQueue = withFileMutationQueue,
	guard?: () => Promise<void> | void,
): Promise<boolean> {
	if (stagedContent === snapshot.content) return false;
	if (Buffer.byteLength(stagedContent, "utf8") > MAX_CONFIG_BYTES) throw new Error("staged .pithos is too large");
	return queue(snapshot.path, async () => {
		await guard?.();
		const current = await readConfigSnapshot(snapshot.path);
		if (current.exists !== snapshot.exists || current.content !== snapshot.content) {
			throw new Error(".pithos changed since Atlas opened it; review the newer file and try again");
		}

		const directory = dirname(snapshot.path);
		const temporaryPath = join(directory, `.pithos.atlas-${process.pid}-${randomUUID()}.tmp`);
		let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined;
		try {
			temporaryHandle = await open(temporaryPath, "wx", snapshot.mode ?? 0o600);
			await temporaryHandle.writeFile(stagedContent, "utf8");
			await temporaryHandle.chmod(snapshot.mode ?? 0o600);
			await temporaryHandle.sync();
			await temporaryHandle.close();
			temporaryHandle = undefined;

			await guard?.();
			const beforeCommit = await readConfigSnapshot(snapshot.path);
			if (beforeCommit.exists !== snapshot.exists || beforeCommit.content !== snapshot.content) {
				throw new Error(".pithos changed since Atlas opened it; review the newer file and try again");
			}
			if (snapshot.exists) {
				await rename(temporaryPath, snapshot.path);
			} else {
				await link(temporaryPath, snapshot.path);
				await unlink(temporaryPath);
			}
			await syncDirectory(directory);
			return true;
		} finally {
			await temporaryHandle?.close().catch(() => undefined);
			await removeIfPresent(temporaryPath);
		}
	});
}
