import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const script = resolve(import.meta.dirname, "../scripts/pi-footer-patch.mjs");
const targetRelative = "dist/modes/interactive/components/footer.js";

const SUPPORTED_VERSIONS = ["0.83.0", "0.84.1", "0.84.2"] as const;

type SupportedVersion = (typeof SUPPORTED_VERSIONS)[number];

function stockFooter(version: SupportedVersion = "0.84.2"): string {
	return readFileSync(resolve(import.meta.dirname, `fixtures/footer-${version}.js`), "utf8");
}

async function fixture(
	source = stockFooter(),
	version: string = "0.84.2",
): Promise<{ root: string; target: string }> {
	const root = await mkdtemp(join(tmpdir(), "atlas-footer-patch-"));
	const target = join(root, targetRelative);
	await mkdir(resolve(target, ".."), { recursive: true });
	await writeFile(join(root, "package.json"), JSON.stringify({
		name: "@earendil-works/pi-coding-agent",
		version,
	}));
	await writeFile(target, source, { mode: 0o754 });
	return { root, target };
}

function patchArgs(
	root: string,
	action: "status" | "apply" | "remove",
	expectations: { version?: string; digest?: string } = {},
): string[] {
	return [
		script,
		"footer",
		action,
		"--pi-dir",
		root,
		...(expectations.version ? ["--expect-version", expectations.version] : []),
		...(expectations.digest ? ["--expect-digest", expectations.digest] : []),
		"--json",
	];
}

function run(
	root: string,
	action: "status" | "apply" | "remove",
	expectations: { version?: string; digest?: string } = {},
) {
	return spawnSync(process.execPath, patchArgs(root, action, expectations), { encoding: "utf8" });
}

function runAsync(
	root: string,
	action: "status" | "apply" | "remove",
	expectations: { version?: string; digest?: string } = {},
	commitDelayMs = 200,
	commitGateFile?: string,
): { completion: Promise<{ status: number | null; stdout: string; stderr: string }> } {
	const child = spawn(process.execPath, patchArgs(root, action, expectations), {
		env: {
			...process.env,
			NODE_ENV: "test",
			PITHOS_ATLAS_TEST_COMMIT_DELAY_MS: String(commitDelayMs),
			...(commitGateFile ? { PITHOS_ATLAS_TEST_COMMIT_GATE_FILE: commitGateFile } : {}),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
	child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
	return {
		completion: new Promise((resolvePromise) => {
			child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
		}),
	};
}

describe("Atlas Pi footer patch", () => {
	it("requires an explicit Pi package target outside the interactive Atlas command", () => {
		const result = spawnSync(process.execPath, [script, "footer", "status", "--json"], {
			encoding: "utf8",
			env: { ...process.env, PITHOS_ATLAS_PI_PACKAGE_DIR: "" },
		});

		assert.equal(result.status, 1);
		assert.match(result.stderr, /--pi-dir or PITHOS_ATLAS_PI_PACKAGE_DIR/);
	});

	it("recognizes only the complete reviewed stock footers for supported Pi versions", async () => {
		for (const version of SUPPORTED_VERSIONS) {
			const { root, target } = await fixture(stockFooter(version), version);
			try {
				const before = await readFile(target, "utf8");
				const result = run(root, "status");

				assert.equal(result.status, 0, result.stderr);
				const report = JSON.parse(result.stdout);
				assert.equal(report.status, "available");
				assert.equal(report.version, version);
				assert.equal(report.file, target);
				assert.match(report.sourceDigest, /^[a-f0-9]{64}$/);
				assert.equal(report.changed, false);
				assert.equal(await readFile(target, "utf8"), before);
			} finally {
				await rm(root, { recursive: true, force: true });
			}
		}
	});

	it("applies the complete compact layout while retaining extension statuses and file mode", async () => {
		const { root, target } = await fixture();
		try {
			const result = run(root, "apply");

			assert.equal(result.status, 0, result.stderr);
			assert.deepEqual(
				Object.fromEntries(Object.entries(JSON.parse(result.stdout)).filter(([key]) => ["status", "changed", "restartRequired"].includes(key))),
				{ status: "applied", changed: true, restartRequired: true },
			);
			const patched = await readFile(target, "utf8");
			assert.match(patched, /Atlas minimal-footer patch: keep accounting/);
			assert.match(patched, /const lines = \[primaryLine\]/);
			assert.match(patched, /width <= 0/);
			assert.match(patched, /availableForPwd/);
			assert.match(patched, /Add extension statuses on a single line/);
			assert.doesNotMatch(patched, /const lines = \[pwdLine, dimStatsLeft \+ dimRemainder\]/);
			assert.equal((await stat(target)).mode & 0o777, 0o754);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("includes provider identity independently of provider count and drops it before model reasoning at narrow widths", async () => {
		const patchedProvider = [
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

		for (const version of SUPPORTED_VERSIONS) {
			const stock = stockFooter(version);
			const { root, target } = await fixture(stock, version);
			try {
				const result = run(root, "apply");
				assert.equal(result.status, 0, result.stderr);

				const patched = await readFile(target, "utf8");
				assert.ok(patched.includes(patchedProvider));
				assert.doesNotMatch(patched, /getAvailableProviderCount/);
				assert.match(patched, /rightSideWithoutProvider =\n\s+thinkingLevel === "off" \? `\$\{modelName\} • thinking off` : `\$\{modelName\} • \$\{thinkingLevel\}`;/);

				const removed = run(root, "remove");
				assert.equal(removed.status, 0, removed.stderr);
				assert.equal(await readFile(target, "utf8"), stock);
			} finally {
				await rm(root, { recursive: true, force: true });
			}
		}
	});

	it("is idempotent and can restore the exact stock source", async () => {
		const { root, target } = await fixture();
		try {
			assert.equal(run(root, "apply").status, 0);
			const patched = await readFile(target, "utf8");
			const repeatedApply = run(root, "apply");
			assert.equal(repeatedApply.status, 0, repeatedApply.stderr);
			assert.equal(JSON.parse(repeatedApply.stdout).changed, false);
			assert.equal(await readFile(target, "utf8"), patched);

			const removed = run(root, "remove");
			assert.equal(removed.status, 0, removed.stderr);
			assert.deepEqual(
				Object.fromEntries(Object.entries(JSON.parse(removed.stdout)).filter(([key]) => ["status", "changed"].includes(key))),
				{ status: "available", changed: true },
			);
			assert.equal(await readFile(target, "utf8"), stockFooter());

			const repeatedRemove = run(root, "remove");
			assert.equal(repeatedRemove.status, 0, repeatedRemove.stderr);
			assert.equal(JSON.parse(repeatedRemove.stdout).changed, false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("refuses unknown and partially patched footer sources", async () => {
		for (const source of [
			"export class FooterComponent {}\n",
			stockFooter().replace("        let statsLeft = statsParts.join(\" \");", "        let statsLeft = \"\";"),
			`${stockFooter()}// unrelated local modification\n`,
		]) {
			const { root, target } = await fixture(source);
			try {
				const before = await readFile(target, "utf8");
				const statusResult = run(root, "status");
				assert.equal(statusResult.status, 2);
				assert.equal(JSON.parse(statusResult.stdout).status, "unsupported");

				const applyResult = run(root, "apply");
				assert.equal(applyResult.status, 1);
				assert.match(applyResult.stderr, /unsupported or only partially patched/);
				assert.equal(await readFile(target, "utf8"), before);
			} finally {
				await rm(root, { recursive: true, force: true });
			}
		}
	});

	it("rejects an unreviewed Pi version even when its footer bytes match", async () => {
		const { root, target } = await fixture(stockFooter(), "0.85.0");
		try {
			const result = run(root, "status");
			assert.equal(result.status, 2);
			assert.equal(JSON.parse(result.stdout).status, "unsupported");
			assert.equal(await readFile(target, "utf8"), stockFooter());
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("binds a mutating invocation to the reviewed Pi version and source digest", async () => {
		const { root, target } = await fixture();
		try {
			const reviewed = JSON.parse(run(root, "status").stdout);
			await writeFile(target, `${stockFooter()}// changed after confirmation\n`);

			const changedSource = run(root, "apply", { version: reviewed.version, digest: reviewed.sourceDigest });
			assert.equal(changedSource.status, 1);
			assert.match(changedSource.stderr, /source changed after review/);

			await writeFile(target, stockFooter());
			await writeFile(join(root, "package.json"), JSON.stringify({
				name: "@earendil-works/pi-coding-agent",
				version: "0.84.1",
			}));
			const changedVersion = run(root, "apply", { version: reviewed.version, digest: reviewed.sourceDigest });
			assert.equal(changedVersion.status, 1);
			assert.match(changedVersion.stderr, /version changed after review/);
			assert.equal(await readFile(target, "utf8"), stockFooter());
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("treats a reviewed stock footer as converged when apply already reached the exact patched source", async () => {
		const { root, target } = await fixture();
		try {
			const reviewed = JSON.parse(run(root, "status").stdout);
			assert.equal(run(root, "apply").status, 0);
			const patched = await readFile(target, "utf8");

			const result = run(root, "apply", { version: reviewed.version, digest: reviewed.sourceDigest });

			assert.equal(result.status, 0, result.stderr);
			assert.deepEqual(
				Object.fromEntries(Object.entries(JSON.parse(result.stdout)).filter(([key]) => ["status", "changed", "restartRequired"].includes(key))),
				{ status: "applied", changed: false, restartRequired: true },
			);
			assert.equal(await readFile(target, "utf8"), patched);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("treats a reviewed patched footer as converged when remove already restored the exact stock source", async () => {
		const { root, target } = await fixture();
		try {
			assert.equal(run(root, "apply").status, 0);
			const reviewed = JSON.parse(run(root, "status").stdout);
			assert.equal(run(root, "remove").status, 0);

			const result = run(root, "remove", { version: reviewed.version, digest: reviewed.sourceDigest });

			assert.equal(result.status, 0, result.stderr);
			assert.deepEqual(
				Object.fromEntries(Object.entries(JSON.parse(result.stdout)).filter(([key]) => ["status", "changed", "restartRequired"].includes(key))),
				{ status: "available", changed: false, restartRequired: true },
			);
			assert.equal(await readFile(target, "utf8"), stockFooter());
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects a stale reviewed digest when the requested action reverses the reviewed transition", async () => {
		const { root, target } = await fixture();
		try {
			const reviewed = JSON.parse(run(root, "status").stdout);
			assert.equal(run(root, "apply").status, 0);
			const patched = await readFile(target, "utf8");

			const result = run(root, "remove", { version: reviewed.version, digest: reviewed.sourceDigest });

			assert.equal(result.status, 1);
			assert.match(result.stderr, /source changed after review/);
			assert.equal(await readFile(target, "utf8"), patched);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("converges when concurrent same-version operations install the exact desired source", async () => {
		async function runConcurrentScenario(action: "apply" | "remove"): Promise<void> {
			const { root, target } = await fixture();
			try {
				if (action === "remove") assert.equal(run(root, "apply").status, 0);
				const reviewed = JSON.parse(run(root, "status").stdout);
				const expectation = { version: reviewed.version, digest: reviewed.sourceDigest };
				const commitGate = join(root, "first-commit.gate");
				await writeFile(commitGate, "waiting");
				const first = runAsync(root, action, expectation, 0, commitGate);
				const targetDirectory = resolve(target, "..");
				const deadline = Date.now() + 2_000;
				while (!(await readdir(targetDirectory)).some((name) => name.startsWith(".footer.atlas-"))) {
					if (Date.now() >= deadline) assert.fail("first patch process did not reach its pre-commit window");
					await delay(5);
				}

				const second = await runAsync(root, action, expectation, 0).completion;
				const desiredSource = await readFile(target, "utf8");
				await rm(commitGate, { force: true });
				assert.equal(second.status, 0, second.stderr);
				assert.equal(JSON.parse(second.stdout).changed, true);

				const converged = await first.completion;
				assert.equal(converged.status, 0, converged.stderr);
				assert.deepEqual(
					Object.fromEntries(Object.entries(JSON.parse(converged.stdout)).filter(([key]) => ["status", "changed", "restartRequired"].includes(key))),
					action === "apply"
						? { status: "applied", changed: false, restartRequired: true }
						: { status: "available", changed: false, restartRequired: true },
				);
				assert.equal(await readFile(target, "utf8"), desiredSource);
			} finally {
				await rm(root, { recursive: true, force: true });
			}
		}

		await Promise.all([runConcurrentScenario("apply"), runConcurrentScenario("remove")]);
	});

	it("aborts when the Pi package version changes during atomic replacement", async () => {
		const { root, target } = await fixture();
		try {
			const reviewed = JSON.parse(run(root, "status").stdout);
			const { completion } = runAsync(root, "apply", { version: reviewed.version, digest: reviewed.sourceDigest });
			const targetDirectory = resolve(target, "..");
			const deadline = Date.now() + 2_000;
			while (!(await readdir(targetDirectory)).some((name) => name.startsWith(".footer.atlas-"))) {
				if (Date.now() >= deadline) assert.fail("patch process did not reach its pre-commit window");
				await delay(5);
			}
			await writeFile(join(root, "package.json"), JSON.stringify({
				name: "@earendil-works/pi-coding-agent",
				version: "0.84.1",
			}));

			const result = await completion;
			assert.equal(result.status, 1);
			assert.match(result.stderr, /version changed while Atlas was preparing the patch/);
			assert.equal(await readFile(target, "utf8"), stockFooter());
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("aborts when the footer changes to an unknown digest during atomic replacement", async () => {
		const { root, target } = await fixture();
		try {
			const reviewed = JSON.parse(run(root, "status").stdout);
			const { completion } = runAsync(root, "apply", { version: reviewed.version, digest: reviewed.sourceDigest });
			const targetDirectory = resolve(target, "..");
			const deadline = Date.now() + 2_000;
			while (!(await readdir(targetDirectory)).some((name) => name.startsWith(".footer.atlas-"))) {
				if (Date.now() >= deadline) assert.fail("patch process did not reach its pre-commit window");
				await delay(5);
			}
			const unknownSource = `${stockFooter()}// third-party change\n`;
			await writeFile(target, unknownSource);

			const result = await completion;
			assert.equal(result.status, 1);
			assert.match(result.stderr, /footer changed while Atlas was preparing the patch/);
			assert.equal(await readFile(target, "utf8"), unknownSource);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects a directory that is not the Pi coding-agent package", async () => {
		const { root, target } = await fixture();
		try {
			await writeFile(join(root, "package.json"), JSON.stringify({ name: "not-pi", version: "0.84.2" }));
			const before = await readFile(target, "utf8");
			const result = run(root, "apply");

			assert.equal(result.status, 1);
			assert.match(result.stderr, /not a valid @earendil-works\/pi-coding-agent package/);
			assert.equal(await readFile(target, "utf8"), before);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
