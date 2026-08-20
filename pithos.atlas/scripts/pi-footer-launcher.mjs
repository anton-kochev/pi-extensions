#!/usr/bin/env node
import { constants } from "node:fs";
import { access, readFile, realpath, stat } from "node:fs/promises";
import { basename, delimiter, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { valid } from "semver";

const PI_PACKAGE_NAME = "@earendil-works/pi-coding-agent";
const PATCH_SCRIPT = fileURLToPath(new URL("./pi-footer-patch.mjs", import.meta.url));
const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];

async function validatedPiPackage(packageRoot) {
	try {
		const resolvedRoot = await realpath(packageRoot);
		const manifest = JSON.parse(await readFile(join(resolvedRoot, "package.json"), "utf8"));
		if (
			typeof manifest !== "object"
			|| manifest === null
			|| manifest.name !== PI_PACKAGE_NAME
			|| typeof manifest.version !== "string"
			|| !valid(manifest.version)
		) return undefined;
		const binPath = typeof manifest.bin === "object" && manifest.bin !== null ? manifest.bin.pi : undefined;
		if (typeof binPath !== "string" || binPath.length === 0) return undefined;
		const entrypoint = await realpath(resolve(resolvedRoot, binPath));
		const relativeEntrypoint = relative(resolvedRoot, entrypoint);
		if (
			relativeEntrypoint === ""
			|| relativeEntrypoint === ".."
			|| relativeEntrypoint.startsWith(`..${sep}`)
			|| isAbsolute(relativeEntrypoint)
			|| !(await stat(entrypoint)).isFile()
		) return undefined;
		return { packageRoot: resolvedRoot, entrypoint };
	} catch {
		return undefined;
	}
}

async function packageForExecutable(executable) {
	let directory = dirname(executable);
	const filesystemRoot = parse(directory).root;
	while (true) {
		const piPackage = await validatedPiPackage(directory);
		if (piPackage) return piPackage.entrypoint === executable ? piPackage : undefined;
		if (directory === filesystemRoot) return undefined;
		directory = dirname(directory);
	}
}

function windowsPackageRoots(pathEntry) {
	const roots = [join(pathEntry, "node_modules", PI_PACKAGE_NAME)];
	if (basename(pathEntry).toLowerCase() === ".bin") roots.push(resolve(pathEntry, "..", PI_PACKAGE_NAME));
	return roots;
}

function effectivePlatform() {
	return process.env.NODE_ENV === "test" && process.env.PITHOS_ATLAS_TEST_PLATFORM === "win32"
		? "win32"
		: process.platform;
}

async function findPi() {
	const launcher = await realpath(fileURLToPath(import.meta.url));
	const searched = [];
	const platform = effectivePlatform();
	for (const entry of (process.env.PATH ?? "").split(delimiter)) {
		const pathEntry = resolve(entry || ".");
		const candidate = resolve(pathEntry, platform === "win32" ? "pi.cmd" : "pi");
		let executable;
		try {
			await access(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
			executable = await realpath(candidate);
		} catch {
			continue;
		}
		if (executable === launcher || searched.includes(executable)) continue;
		searched.push(executable);
		if (platform === "win32") {
			for (const packageRoot of windowsPackageRoots(pathEntry)) {
				const piPackage = await validatedPiPackage(packageRoot);
				if (piPackage) return { command: process.execPath, commandArgs: [piPackage.entrypoint], packageRoot: piPackage.packageRoot };
			}
			continue;
		}
		const piPackage = await packageForExecutable(executable);
		if (piPackage) return { command: executable, commandArgs: [], packageRoot: piPackage.packageRoot };
	}
	throw new Error(`Could not find a valid ${PI_PACKAGE_NAME} pi executable later on PATH`);
}

function run(command, args, stdio) {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(command, args, { env: process.env, stdio });
		const handlers = new Map();
		for (const signal of FORWARDED_SIGNALS) {
			const handler = () => child.kill(signal);
			handlers.set(signal, handler);
			process.on(signal, handler);
		}
		const cleanup = () => {
			for (const [signal, handler] of handlers) process.off(signal, handler);
		};
		child.once("error", (error) => {
			cleanup();
			reject(error);
		});
		child.once("close", (code, signal) => {
			cleanup();
			resolvePromise({ code, signal });
		});
	});
}

function finish(result) {
	if (result.signal) {
		process.kill(process.pid, result.signal);
		return;
	}
	process.exitCode = result.code ?? 1;
}

async function main() {
	const pi = await findPi();
	const patch = await run(process.execPath, [
		PATCH_SCRIPT,
		"footer",
		"apply",
		"--pi-dir",
		pi.packageRoot,
		"--json",
	], ["ignore", "ignore", "inherit"]);
	if (patch.signal) {
		finish(patch);
		return;
	}
	if (patch.code !== 0) {
		process.exitCode = patch.code ?? 1;
		return;
	}
	finish(await run(pi.command, [...pi.commandArgs, ...process.argv.slice(2)], "inherit"));
}

main().catch((error) => {
	console.error(`pithos-atlas-pi: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
});
