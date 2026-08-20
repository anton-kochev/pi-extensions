#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { valid } from "semver";

const PI_PACKAGE_NAME = "@earendil-works/pi-coding-agent";
const FOOTER_RELATIVE_PATH = "dist/modes/interactive/components/footer.js";
const MAX_FOOTER_BYTES = 512 * 1024;
const SUPPORTED_DIGESTS = new Map([
	["0.83.0", {
		stock: "93ab0115c434d57f36b133c5a40cfed74e9f8689372a184a1b0ac9ba0f0e58b6",
		patched: "38b864e96b2bc9d381e5006603ee12d5efd85672beae0a35399038fb6c8fcfc4",
	}],
	["0.84.1", {
		stock: "05cc0ab96cbdacf15a34f4e2a9a3ee0395abaeaac638c1c153632cb0befbc9d1",
		patched: "896c2f622a336feace7f27e35191f85b55199843f0c8ed67ec271d42a3219aef",
	}],
	["0.84.2", {
		stock: "05cc0ab96cbdacf15a34f4e2a9a3ee0395abaeaac638c1c153632cb0befbc9d1",
		patched: "896c2f622a336feace7f27e35191f85b55199843f0c8ed67ec271d42a3219aef",
	}],
]);

const STOCK_STATS = "        let statsLeft = statsParts.join(\" \");";
const PATCHED_STATS = [
	"        // Atlas minimal-footer patch: keep accounting available through /session but hide it here.",
	"        let statsLeft = \"\";",
].join("\n");

const STOCK_PROVIDER = [
	"        // Prepend the provider in parentheses if there are multiple providers and there's enough room",
	"        let rightSide = rightSideWithoutProvider;",
	"        if (this.footerData.getAvailableProviderCount() > 1 && state.model) {",
	"            rightSide = `(${state.model.provider}) ${rightSideWithoutProvider}`;",
	"            if (statsLeftWidth + minPadding + visibleWidth(rightSide) > width) {",
	"                // Too wide, fall back",
	"                rightSide = rightSideWithoutProvider;",
	"            }",
	"        }",
].join("\n");

const PATCHED_PROVIDER = [
	"        // Atlas minimal-footer patch: include provider identity whenever a model exists.",
	"        let rightSide = rightSideWithoutProvider;",
	"        if (state.model) {",
	"            rightSide = `(${state.model.provider}) ${rightSideWithoutProvider}`;",
	"            if (visibleWidth(rightSide) > width) {",
	"                // Too wide, drop provider before model or reasoning.",
	"                rightSide = rightSideWithoutProvider;",
	"            }",
	"        }",
].join("\n");

const STOCK_LAYOUT = [
	"        const dimStatsLeft = theme.fg(\"dim\", statsLeft);",
	"        const remainder = statsLine.slice(statsLeft.length); // padding + rightSide",
	"        const dimRemainder = theme.fg(\"dim\", remainder);",
	"        const pwdLine = truncateToWidth(theme.fg(\"dim\", pwd), width, theme.fg(\"dim\", \"...\"));",
	"        const lines = [pwdLine, dimStatsLeft + dimRemainder];",
].join("\n");

const PATCHED_LAYOUT = [
	"        // Atlas minimal-footer patch: combine working context and model identity on one line.",
	"        let primaryLine;",
	"        if (width <= 0) {",
	"            primaryLine = \"\";",
	"        }",
	"        else {",
	"            const dimRight = theme.fg(\"dim\", rightSide);",
	"            const rightWidth = visibleWidth(rightSide);",
	"            if (rightWidth >= width) {",
	"                primaryLine = truncateToWidth(dimRight, width, \"\");",
	"            }",
	"            else {",
	"                const availableForPwd = Math.max(0, width - rightWidth - minPadding);",
	"                const dimPwd = truncateToWidth(theme.fg(\"dim\", pwd), availableForPwd, theme.fg(\"dim\", \"...\"));",
	"                const padding = \" \".repeat(Math.max(0, width - visibleWidth(dimPwd) - rightWidth));",
	"                primaryLine = truncateToWidth(dimPwd + padding + dimRight, width, \"\");",
	"            }",
	"        }",
	"        const lines = [primaryLine];",
].join("\n");

function usage() {
	return "Usage: pithos-atlas-patch footer <status|apply|remove> (--pi-dir <path> | PITHOS_ATLAS_PI_PACKAGE_DIR=<path>) [--expect-version <version>] [--expect-digest <sha256>] [--json]";
}

function parseArgs(args) {
	const positional = [];
	let piDir;
	let expectVersion;
	let expectDigest;
	let json = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json") json = true;
		else if (arg === "--pi-dir" || arg === "--expect-version" || arg === "--expect-digest") {
			const value = args[index + 1];
			if (!value) throw new Error(`${arg} requires a value`);
			if (arg === "--pi-dir") piDir = value;
			else if (arg === "--expect-version") expectVersion = value;
			else expectDigest = value;
			index += 1;
		} else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
		else positional.push(arg);
	}
	if (positional[0] !== "footer" || !["status", "apply", "remove"].includes(positional[1]) || positional.length !== 2) {
		throw new Error(usage());
	}
	if (expectDigest && !/^[a-f0-9]{64}$/u.test(expectDigest)) throw new Error("--expect-digest must be a lowercase SHA-256 digest");
	return { action: positional[1], piDir, expectVersion, expectDigest, json };
}

function digest(source) {
	return createHash("sha256").update(source, "utf8").digest("hex");
}

function patchState(version, sourceDigest) {
	const supported = SUPPORTED_DIGESTS.get(version);
	if (!supported) return "unsupported";
	if (sourceDigest === supported.stock) return "available";
	if (sourceDigest === supported.patched) return "applied";
	return "unsupported";
}

async function inspectPackage(packageDirectory) {
	const root = resolve(packageDirectory);
	const manifestPath = join(root, "package.json");
	let manifest;
	try {
		manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	} catch (error) {
		throw new Error(`Could not read Pi package manifest: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (manifest.name !== PI_PACKAGE_NAME || typeof manifest.version !== "string" || !valid(manifest.version)) {
		throw new Error(`Target is not a valid ${PI_PACKAGE_NAME} package`);
	}
	const file = join(root, FOOTER_RELATIVE_PATH);
	const stats = await lstat(file);
	if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("Pi footer target must be a regular file");
	if (stats.size > MAX_FOOTER_BYTES) throw new Error("Pi footer target is unexpectedly large");
	const source = await readFile(file, "utf8");
	if (Buffer.byteLength(source, "utf8") > MAX_FOOTER_BYTES) throw new Error("Pi footer target is unexpectedly large");
	const sourceDigest = digest(source);
	return {
		root,
		version: manifest.version,
		file,
		mode: stats.mode & 0o777,
		source,
		sourceDigest,
		status: patchState(manifest.version, sourceDigest),
	};
}

function transform(snapshot, action) {
	const supported = SUPPORTED_DIGESTS.get(snapshot.version);
	if (!supported) throw new Error("Pi footer source is unsupported or only partially patched");
	let nextSource;
	let expectedDigest;
	if (action === "apply") {
		if (snapshot.status === "applied") return snapshot.source;
		if (snapshot.status !== "available") throw new Error("Pi footer source is unsupported or only partially patched");
		nextSource = snapshot.source
			.replace(STOCK_STATS, PATCHED_STATS)
			.replace(STOCK_PROVIDER, PATCHED_PROVIDER)
			.replace(STOCK_LAYOUT, PATCHED_LAYOUT);
		expectedDigest = supported.patched;
	}
	else {
		if (snapshot.status === "available") return snapshot.source;
		if (snapshot.status !== "applied") throw new Error("Pi footer source is unsupported or only partially patched");
		nextSource = snapshot.source
			.replace(PATCHED_STATS, STOCK_STATS)
			.replace(PATCHED_PROVIDER, STOCK_PROVIDER)
			.replace(PATCHED_LAYOUT, STOCK_LAYOUT);
		expectedDigest = supported.stock;
	}
	if (digest(nextSource) !== expectedDigest) throw new Error("Pi footer transformation did not produce the reviewed source");
	return nextSource;
}

async function syncDirectory(path) {
	const handle = await open(path, "r");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

function replacementState(snapshot, current, desiredDigest) {
	if (current.version !== snapshot.version) throw new Error("Pi version changed while Atlas was preparing the patch");
	if (current.sourceDigest === snapshot.sourceDigest) return "pending";
	if (current.sourceDigest === desiredDigest) return "converged";
	throw new Error("Pi footer changed while Atlas was preparing the patch");
}

async function pauseBeforeCommitForTest() {
	if (process.env.NODE_ENV !== "test") return;
	const milliseconds = Number(process.env.PITHOS_ATLAS_TEST_COMMIT_DELAY_MS);
	if (Number.isFinite(milliseconds) && milliseconds > 0) {
		await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
	}
	const gateFile = process.env.PITHOS_ATLAS_TEST_COMMIT_GATE_FILE;
	if (!gateFile) return;
	while (true) {
		try {
			await lstat(gateFile);
		} catch (error) {
			if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
			throw error;
		}
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
	}
}

async function atomicReplace(snapshot, nextSource) {
	if (nextSource === snapshot.source) return { changed: false, converged: false };
	const desiredDigest = digest(nextSource);
	const current = await inspectPackage(snapshot.root);
	if (replacementState(snapshot, current, desiredDigest) === "converged") {
		return { changed: false, converged: true };
	}
	const temporary = join(dirname(snapshot.file), `.footer.atlas-${process.pid}-${randomUUID()}.tmp`);
	let handle;
	try {
		handle = await open(temporary, "wx", snapshot.mode);
		await handle.writeFile(nextSource, "utf8");
		await handle.chmod(snapshot.mode);
		await handle.sync();
		await handle.close();
		handle = undefined;
		await pauseBeforeCommitForTest();
		const beforeCommit = await inspectPackage(snapshot.root);
		if (replacementState(snapshot, beforeCommit, desiredDigest) === "converged") {
			return { changed: false, converged: true };
		}
		await rename(temporary, snapshot.file);
		await chmod(snapshot.file, snapshot.mode);
		if (process.platform !== "win32") await syncDirectory(dirname(snapshot.file));
		return { changed: true, converged: false };
	} finally {
		await handle?.close().catch(() => undefined);
		await rm(temporary, { force: true }).catch(() => undefined);
	}
}

function isReviewedStaleConvergence(snapshot, action, expectedDigest) {
	const supported = SUPPORTED_DIGESTS.get(snapshot.version);
	if (!supported) return false;
	if (action === "apply") {
		return expectedDigest === supported.stock
			&& snapshot.sourceDigest === supported.patched
			&& snapshot.status === "applied";
	}
	if (action === "remove") {
		return expectedDigest === supported.patched
			&& snapshot.sourceDigest === supported.stock
			&& snapshot.status === "available";
	}
	return false;
}

function output(result, json) {
	if (json) {
		process.stdout.write(`${JSON.stringify(result)}\n`);
		return;
	}
	console.log(`Pi ${result.version} footer patch: ${result.status}`);
	console.log(`Target: ${result.file}`);
	if (result.restartRequired) console.log("Restart Pi to use the changed footer.");
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const configuredDirectory = options.piDir || process.env.PITHOS_ATLAS_PI_PACKAGE_DIR;
	if (!configuredDirectory) throw new Error("Provide --pi-dir or PITHOS_ATLAS_PI_PACKAGE_DIR to select the Pi package explicitly");
	const packageDirectory = resolve(configuredDirectory);
	const snapshot = await inspectPackage(packageDirectory);
	if (options.expectVersion && options.expectVersion !== snapshot.version) {
		throw new Error(`Pi version changed after review: expected ${options.expectVersion}, found ${snapshot.version}`);
	}
	const staleConvergence = Boolean(
		options.expectDigest
		&& options.expectDigest !== snapshot.sourceDigest
		&& isReviewedStaleConvergence(snapshot, options.action, options.expectDigest),
	);
	if (options.expectDigest && options.expectDigest !== snapshot.sourceDigest && !staleConvergence) {
		throw new Error("Pi footer source changed after review; no change was made");
	}
	let changed = false;
	let convergedDuringMutation = false;
	let status = snapshot.status;
	let sourceDigest = snapshot.sourceDigest;
	if (options.action !== "status") {
		const nextSource = transform(snapshot, options.action);
		const replacement = await atomicReplace(snapshot, nextSource);
		changed = replacement.changed;
		convergedDuringMutation = replacement.converged;
		sourceDigest = digest(nextSource);
		status = patchState(snapshot.version, sourceDigest);
	}
	const result = {
		patch: "footer",
		action: options.action,
		status,
		changed,
		packageDir: snapshot.root,
		version: snapshot.version,
		file: snapshot.file,
		sourceDigest,
		restartRequired: changed || staleConvergence || convergedDuringMutation,
	};
	output(result, options.json);
	if (status === "unsupported") process.exitCode = 2;
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
