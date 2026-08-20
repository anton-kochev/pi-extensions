import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const launcher = resolve(import.meta.dirname, "../scripts/pi-footer-launcher.mjs");
const footerRelative = "dist/modes/interactive/components/footer.js";
const stockFooter = readFileSync(resolve(import.meta.dirname, "fixtures/footer-0.84.2.js"), "utf8");

interface LauncherFixture {
	root: string;
	packageRoot: string;
	footer: string;
	record: string;
	path: string;
	wrapper: string;
}

type WindowsNpmLayout = "global-prefix" | "local-bin";

async function fixture(source = stockFooter, version = "0.84.2"): Promise<LauncherFixture> {
	const root = await mkdtemp(join(tmpdir(), "atlas-footer-launcher-"));
	const packageRoot = join(root, "node_modules", "@earendil-works", "pi-coding-agent");
	const footer = join(packageRoot, footerRelative);
	const cli = join(packageRoot, "dist", "cli.js");
	const wrapperBin = join(root, "wrapper-bin");
	const selfLinkBin = join(root, "self-link-bin");
	const realBin = join(root, "real-bin");
	const record = join(root, "pi-record.json");
	await mkdir(resolve(footer, ".."), { recursive: true });
	await mkdir(wrapperBin);
	await mkdir(selfLinkBin);
	await mkdir(realBin);
	await writeFile(join(packageRoot, "package.json"), JSON.stringify({
		name: "@earendil-works/pi-coding-agent",
		version,
		bin: { pi: "dist/cli.js" },
	}));
	await writeFile(footer, source);
	await writeFile(cli, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
const footer = readFileSync(new URL("./modes/interactive/components/footer.js", import.meta.url), "utf8");
const input = process.env.ATLAS_FAKE_PI_READ_STDIN ? readFileSync(0, "utf8") : undefined;
writeFileSync(process.env.ATLAS_LAUNCHER_RECORD, JSON.stringify({ args: process.argv.slice(2), patched: footer.includes("Atlas minimal-footer patch"), ...(input === undefined ? {} : { input }) }));
process.stdout.write("fake Pi started\\n");
if (process.env.ATLAS_FAKE_PI_STDERR) process.stderr.write("fake Pi warning\\n");
if (process.env.ATLAS_FAKE_PI_SIGNAL) process.kill(process.pid, process.env.ATLAS_FAKE_PI_SIGNAL);
if (process.env.ATLAS_FAKE_PI_EXIT_CODE) process.exit(Number(process.env.ATLAS_FAKE_PI_EXIT_CODE));
`);
	await chmod(cli, 0o755);
	const wrapper = join(wrapperBin, "pi");
	await symlink(launcher, wrapper);
	await symlink(wrapper, join(selfLinkBin, "pi"));
	await symlink(cli, join(realBin, "pi"));
	return {
		root,
		packageRoot,
		footer,
		record,
		path: [wrapperBin, selfLinkBin, realBin, process.env.PATH ?? ""].join(delimiter),
		wrapper,
	};
}

async function windowsNpmFixture(layout: WindowsNpmLayout): Promise<LauncherFixture & { shimRecord: string }> {
	const root = await mkdtemp(join(tmpdir(), "atlas-footer-launcher-win32-"));
	const wrapperBin = join(root, "wrapper-bin");
	const nodeModules = layout === "global-prefix"
		? join(root, "npm-prefix", "node_modules")
		: join(root, "project", "node_modules");
	const npmBin = layout === "global-prefix" ? resolve(nodeModules, "..") : join(nodeModules, ".bin");
	const packageRoot = join(nodeModules, "@earendil-works", "pi-coding-agent");
	const footer = join(packageRoot, footerRelative);
	const cli = join(packageRoot, "dist", "cli.js");
	const record = join(root, "pi-record.json");
	const shimRecord = join(root, "shim-record.txt");
	await mkdir(resolve(footer, ".."), { recursive: true });
	await mkdir(wrapperBin);
	await mkdir(npmBin, { recursive: true });
	await writeFile(join(packageRoot, "package.json"), JSON.stringify({
		name: "@earendil-works/pi-coding-agent",
		version: "0.84.2",
		bin: { pi: "dist/cli.js" },
	}));
	await writeFile(footer, stockFooter);
	await writeFile(cli, `import { readFileSync, writeFileSync } from "node:fs";
const footer = readFileSync(new URL("./modes/interactive/components/footer.js", import.meta.url), "utf8");
writeFileSync(process.env.ATLAS_LAUNCHER_RECORD, JSON.stringify({ args: process.argv.slice(2), patched: footer.includes("Atlas minimal-footer patch") }));
if (process.env.ATLAS_FAKE_PI_EXIT_CODE) process.exit(Number(process.env.ATLAS_FAKE_PI_EXIT_CODE));
`);
	const shim = join(npmBin, "pi.cmd");
	await writeFile(shim, `#!/bin/sh\nprintf shim-executed > "$ATLAS_SHIM_RECORD"\nexit 91\n`);
	await chmod(shim, 0o755);
	const wrapper = join(wrapperBin, "pi");
	await symlink(launcher, wrapper);
	return {
		root,
		packageRoot,
		footer,
		record,
		shimRecord,
		path: [wrapperBin, npmBin, dirname(process.execPath)].join(delimiter),
		wrapper,
	};
}

function run(
	testFixture: LauncherFixture,
	args: string[] = [],
	options: { env?: Record<string, string>; input?: string } = {},
) {
	return spawnSync(testFixture.wrapper, args, {
		encoding: "utf8",
		env: { ...process.env, PATH: testFixture.path, ATLAS_LAUNCHER_RECORD: testFixture.record, ...options.env },
		input: options.input,
	});
}

describe("Atlas Pi footer launcher", () => {
	it("discovers global and local Windows npm layouts without executing pi.cmd contents", async () => {
		for (const [layout, exitCode] of [["global-prefix", 0], ["local-bin", 29]] as const) {
			const testFixture = await windowsNpmFixture(layout);
			try {
				const args = ["--model", "fake/model", `prompt for ${layout}`];
				const result = run(testFixture, args, {
					env: {
						NODE_ENV: "test",
						PITHOS_ATLAS_TEST_PLATFORM: "win32",
						ATLAS_FAKE_PI_EXIT_CODE: String(exitCode),
						ATLAS_SHIM_RECORD: testFixture.shimRecord,
					},
				});

				assert.equal(result.status, exitCode, result.stderr);
				assert.deepEqual(JSON.parse(await readFile(testFixture.record, "utf8")), { args, patched: true });
				assert.match(await readFile(testFixture.footer, "utf8"), /Atlas minimal-footer patch/);
				await assert.rejects(readFile(testFixture.shimRecord, "utf8"), { code: "ENOENT" });
			} finally {
				await rm(testFixture.root, { recursive: true, force: true });
			}
		}
	});

	it("skips aliases of itself, patches the real Pi package, then starts Pi with unchanged arguments", async () => {
		const testFixture = await fixture();
		try {
			const result = run(testFixture, ["--model", "fake/model", "prompt with spaces"]);

			assert.equal(result.status, 0, result.stderr);
			assert.equal(result.stdout, "fake Pi started\n");
			assert.deepEqual(JSON.parse(await readFile(testFixture.record, "utf8")), {
				args: ["--model", "fake/model", "prompt with spaces"],
				patched: true,
			});
			assert.match(await readFile(testFixture.footer, "utf8"), /Atlas minimal-footer patch/);
		} finally {
			await rm(testFixture.root, { recursive: true, force: true });
		}
	});

	it("starts Pi repeatedly when the footer is already patched without changing it again", async () => {
		const testFixture = await fixture();
		try {
			assert.equal(run(testFixture).status, 0);
			const patched = await readFile(testFixture.footer, "utf8");

			const repeated = run(testFixture, ["second"]);

			assert.equal(repeated.status, 0, repeated.stderr);
			assert.equal(await readFile(testFixture.footer, "utf8"), patched);
			assert.deepEqual(JSON.parse(await readFile(testFixture.record, "utf8")), { args: ["second"], patched: true });
		} finally {
			await rm(testFixture.root, { recursive: true, force: true });
		}
	});

	it("refuses an unsupported Pi footer without launching Pi or modifying the target", async () => {
		const unsupported = `${stockFooter}// local change\n`;
		const testFixture = await fixture(unsupported);
		try {
			const result = run(testFixture);

			assert.equal(result.status, 1);
			assert.match(result.stderr, /unsupported or only partially patched/);
			await assert.rejects(readFile(testFixture.record, "utf8"), { code: "ENOENT" });
			assert.equal(await readFile(testFixture.footer, "utf8"), unsupported);
		} finally {
			await rm(testFixture.root, { recursive: true, force: true });
		}
	});

	it("connects Pi directly to the launcher's standard streams", async () => {
		const testFixture = await fixture();
		try {
			const result = run(testFixture, [], {
				env: { ATLAS_FAKE_PI_READ_STDIN: "1", ATLAS_FAKE_PI_STDERR: "1" },
				input: "input for Pi\n",
			});

			assert.equal(result.status, 0, result.stderr);
			assert.equal(result.stdout, "fake Pi started\n");
			assert.equal(result.stderr, "fake Pi warning\n");
			assert.equal(JSON.parse(await readFile(testFixture.record, "utf8")).input, "input for Pi\n");
		} finally {
			await rm(testFixture.root, { recursive: true, force: true });
		}
	});

	it("propagates Pi exit codes", async () => {
		const testFixture = await fixture();
		try {
			const result = run(testFixture, [], { env: { ATLAS_FAKE_PI_EXIT_CODE: "23" } });
			assert.equal(result.status, 23, result.stderr);
			assert.equal(result.signal, null);
		} finally {
			await rm(testFixture.root, { recursive: true, force: true });
		}
	});

	it("propagates a signal that terminates Pi", { skip: process.platform === "win32" }, async () => {
		const testFixture = await fixture();
		try {
			const result = run(testFixture, [], { env: { ATLAS_FAKE_PI_SIGNAL: "SIGTERM" } });
			assert.equal(result.status, null);
			assert.equal(result.signal, "SIGTERM");
		} finally {
			await rm(testFixture.root, { recursive: true, force: true });
		}
	});
});
