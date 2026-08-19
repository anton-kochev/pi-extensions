import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import registerCommitWorkflow, {
	CREATE_COMMIT_TOOL_NAME,
	isDirectGitCommitCommand,
} from "../src/commit.ts";

type ExecCall = { command: string; args: string[]; cwd?: string; signal?: AbortSignal };
type ExecResult = { stdout: string; stderr: string; code: number; killed: boolean };

function result(stdout = "", code = 0, stderr = ""): ExecResult {
	return { stdout, stderr, code, killed: false };
}

function createHarness(options: {
	cwd?: string;
	hasUI?: boolean;
	confirm?: (title: string, message: string, options?: { signal?: AbortSignal }) => Promise<boolean>;
	exec?: (command: string, args: string[], options?: { cwd?: string; signal?: AbortSignal }) => Promise<ExecResult>;
} = {}) {
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const handlers = new Map<string, (event: any, ctx: any) => Promise<any> | any>();
	const execCalls: ExecCall[] = [];
	const confirmations: Array<{ title: string; message: string; signal?: AbortSignal }> = [];
	const pi = {
		registerCommand(name: string, command: any) {
			commands.set(name, command);
		},
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		on(name: string, handler: (event: any, ctx: any) => Promise<any> | any) {
			handlers.set(name, handler);
		},
		sendMessage() {},
		async exec(command: string, args: string[], execOptions?: { cwd?: string; signal?: AbortSignal }) {
			execCalls.push({ command, args, cwd: execOptions?.cwd, signal: execOptions?.signal });
			return options.exec?.(command, args, execOptions) ?? result();
		},
	};
	const ctx = {
		cwd: options.cwd ?? "/workspace/project",
		hasUI: options.hasUI ?? true,
		ui: {
			async confirm(title: string, message: string, confirmOptions?: { signal?: AbortSignal }) {
				confirmations.push({ title, message, signal: confirmOptions?.signal });
				return options.confirm?.(title, message, confirmOptions) ?? false;
			},
		},
	};
	registerCommitWorkflow(pi as never);
	return { tools, commands, handlers, execCalls, confirmations, ctx };
}

function stagedExec(options: {
	trees?: string[];
	priorHash?: string | null;
	headReads?: Array<string | null>;
	headRefs?: Array<string | null>;
	baseTree?: string;
	commitResult?: ExecResult;
	createdHash?: string;
	committedTree?: string;
	committedParents?: string[];
	committedMessage?: string;
	fullDiff?: string;
	mergeReads?: boolean[];
} = {}) {
	const trees = [...(options.trees ?? ["tree-approved", "tree-approved"])];
	const merges = [...(options.mergeReads ?? [false, false])];
	let lastMerge = merges.at(-1) ?? false;
	let lastTree = trees.at(-1) ?? "tree-approved";
	const priorHash = options.priorHash === undefined ? "parent123" : options.priorHash;
	const createdHash = options.createdHash ?? "abc123456789";
	const heads = [...(options.headReads ?? [priorHash, priorHash, createdHash, createdHash, createdHash])];
	let lastHead = heads.at(-1) ?? null;
	const headRefs = [...(options.headRefs ?? ["refs/heads/main"])] as Array<string | null>;
	let lastHeadRef = headRefs.at(-1) ?? null;
	const baseTree = options.baseTree ?? "tree-parent";
	const committedTree = options.committedTree ?? "tree-approved";
	const committedParents = options.committedParents ?? (priorHash === null ? [] : [priorHash]);
	const committedMessage = options.committedMessage ?? "fix: example";
	return async (
		_command: string,
		args: string[],
		_options?: { cwd?: string; signal?: AbortSignal },
	): Promise<ExecResult> => {
		if (args.join(" ") === "symbolic-ref --quiet HEAD") {
			if (headRefs.length > 0) lastHeadRef = headRefs.shift() ?? null;
			return lastHeadRef === null ? result("", 1) : result(`${lastHeadRef}\n`);
		}
		if (args.join(" ") === "rev-parse --verify --quiet HEAD"
			|| (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "--quiet" && args[3]?.startsWith("refs/"))) {
			if (heads.length > 0) lastHead = heads.shift() ?? null;
			return lastHead === null ? result("", 1) : result(`${lastHead}\n`);
		}
		if (args.join(" ") === "rev-parse --verify --quiet MERGE_HEAD") {
			if (merges.length > 0) lastMerge = merges.shift() ?? false;
			return lastMerge ? result("merge-parent\n") : result("", 1);
		}
		if (priorHash !== null && args.join(" ") === `rev-parse --verify ${priorHash}^{tree}`) {
			return result(`${baseTree}\n`);
		}
		if (priorHash === null && args.join(" ") === "hash-object -t tree --stdin") {
			return result(`${baseTree}\n`);
		}
		if (args.join(" ") === `diff --name-status ${baseTree} tree-approved`) return result("M\tfile.ts\n");
		if (args.join(" ") === `diff --binary --no-ext-diff ${baseTree} tree-approved`) {
			return result(options.fullDiff ?? "diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new\n");
		}
		if (args.join(" ") === "write-tree") {
			lastTree = trees.shift() ?? lastTree;
			return result(`${lastTree}\n`);
		}
		if (args[0] === "commit") return options.commitResult ?? result("[main abc1234] fix: example\n");
		if (args.join(" ") === `cat-file commit ${createdHash}`) {
			const parents = committedParents.map((parent) => `parent ${parent}\n`).join("");
			return result(`tree ${committedTree}\n${parents}author Test <test@example.com> 0 +0000\ncommitter Test <test@example.com> 0 +0000\n\n${committedMessage}\n`);
		}
		if (args[0] === "update-ref") return result();
		throw new Error(`Unexpected git args: ${args.join(" ")}`);
	};
}

function git(cwd: string, args: string[]): string {
	const completed = spawnSync("git", args, { cwd, encoding: "utf8" });
	assert.equal(completed.status, 0, `git ${args.join(" ")} failed: ${completed.stderr}`);
	return completed.stdout;
}

function createTemporaryRepository(): string {
	const cwd = mkdtempSync(join(tmpdir(), "guild-commit-test-"));
	git(cwd, ["init", "--quiet"]);
	git(cwd, ["config", "user.name", "Guild Test"]);
	git(cwd, ["config", "user.email", "guild@example.test"]);
	writeFileSync(join(cwd, "approved.txt"), "before\n");
	writeFileSync(join(cwd, "hooked.txt"), "before\n");
	git(cwd, ["add", "approved.txt", "hooked.txt"]);
	git(cwd, ["commit", "--quiet", "-m", "test: baseline"]);
	return cwd;
}

function repositoryExec(command: string, args: string[], options?: { cwd?: string }): Promise<ExecResult> {
	const completed = spawnSync(command, args, { cwd: options?.cwd, encoding: "utf8" });
	return Promise.resolve({
		stdout: completed.stdout,
		stderr: completed.stderr,
		code: completed.status ?? 1,
		killed: completed.signal !== null,
	});
}

describe("controlled commit tool", () => {
	it("registers a sequential create_commit tool with controlled hook bypass", () => {
		const harness = createHarness();
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		assert.ok(tool);
		assert.equal(tool.executionMode, "sequential");
		assert.deepEqual(tool.parameters.required, ["message"]);
		assert.equal(tool.parameters.properties.noVerify.type, "boolean");
	});

	it("shows the complete message and only the staged files before leaving declined changes intact", async () => {
		const message = "fix: example\n\nExplain the complete reason.";
		const patchContent = "SECRET_PATCH_CONTENT";
		const harness = createHarness({
			confirm: async () => false,
			exec: stagedExec({ fullDiff: patchContent }),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-1", { message }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.match(response.content[0].text, /cancelled/i);
		assert.equal(harness.confirmations.length, 1);
		assert.match(harness.confirmations[0]?.title ?? "", /create.*commit/i);
		assert.ok(harness.confirmations[0]?.message.includes(message));
		assert.match(harness.confirmations[0]?.message ?? "", /staged files/i);
		assert.match(harness.confirmations[0]?.message ?? "", /M\s+file\.ts/);
		assert.doesNotMatch(harness.confirmations[0]?.message ?? "", /SECRET_PATCH_CONTENT/);
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "commit"), false);
	});

	it("fails closed when interactive approval is unavailable", async () => {
		const harness = createHarness({ hasUI: false, exec: stagedExec() });
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-2", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.match(response.content[0].text, /interactive approval.*unavailable/i);
		assert.equal(harness.execCalls.length, 0);
	});

	it("commits the approved parent, tree, and exact full message", async () => {
		const message = "fix: approved change\n\nExplain the complete reason.";
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({ committedMessage: message }),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-3", { message }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, true);
		assert.equal(response.details.hash, "abc123456789");
		assert.equal(response.details.subject, "fix: approved change");
		const commit = harness.execCalls.find(({ args }) => args[0] === "commit");
		assert.deepEqual(commit?.args, ["commit", "--cleanup=verbatim", "-m", message]);
		assert.equal(commit?.cwd, harness.ctx.cwd);
		assert.equal(commit?.signal, undefined);
		assert.ok(harness.execCalls.some(({ args }) => args.join(" ") === "cat-file commit abc123456789"));
	});

	it("binds the approval file list to immutable baseline and index trees", async () => {
		let mutableIndex = "tree-a";
		const harness = createHarness({
			confirm: async () => false,
			exec: async (_command, args) => {
				const command = args.join(" ");
				if (command === "rev-parse --verify --quiet MERGE_HEAD") return result("", 1);
				if (command === "symbolic-ref --quiet HEAD") return result("refs/heads/main\n");
				if (command === "rev-parse --verify --quiet refs/heads/main") return result("head-a\n");
				if (command === "rev-parse --verify head-a^{tree}") return result("tree-head-a\n");
				if (command === "write-tree") return result(`${mutableIndex}\n`);
				if (command === "diff --name-status tree-head-a tree-a") {
					mutableIndex = "tree-b";
					return result("M\tapproved-a.ts\n");
				}
				throw new Error(`Unexpected git args: ${command}`);
			},
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-immutable-files", { message: "fix: immutable approval" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.reason, "cancelled");
		assert.match(harness.confirmations[0]?.message ?? "", /M\s+approved-a\.ts/);
		assert.equal(harness.execCalls.some(({ args }) => args.includes("--cached")), false);
	});

	it("aborts when the exact staged tree changes during confirmation", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({ trees: ["tree-approved", "tree-after"] }),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-4", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.match(response.content[0].text, /staged changes changed/i);
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "commit"), false);
	});

	it("aborts when HEAD changes during confirmation", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({ headReads: ["parent123", "other-parent"] }),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-head-race", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.equal(response.details.reason, "repository-head-changed");
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "commit"), false);
	});

	it("aborts when symbolic HEAD switches to a same-tip branch during approval", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({
				headRefs: ["refs/heads/main", "refs/heads/same-tip"],
				headReads: ["parent123", "parent123"],
			}),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-symbolic-head-race", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.equal(response.details.reason, "repository-head-changed");
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "commit"), false);
	});

	it("refuses a merge that starts during confirmation before invoking commit", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({ mergeReads: [false, true] }),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-merge-race", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.equal(response.details.reason, "merge-in-progress");
		assert.equal(harness.confirmations.length, 1);
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "commit"), false);
	});

	it("does not rewrite an intervening commit after git returns", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({
				createdHash: "intervening",
				headReads: ["parent123", "parent123", "intervening"],
				committedParents: ["our-unobserved-candidate"],
			}),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-intervened", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.equal(response.details.reason, "commit-reconciliation-required");
		assert.equal(response.details.hash, "intervening");
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "update-ref"), false);
	});

	it("does not claim ordinary success when HEAD switches after the captured ref advances", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({
				headRefs: ["refs/heads/main", "refs/heads/main", "refs/heads/other"],
				headReads: ["parent123", "parent123", "abc123456789", "abc123456789"],
			}),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-post-switch", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.equal(response.details.reason, "commit-reconciliation-required");
		assert.match(response.content[0].text, /HEAD identity changed|ordinary success/i);
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "update-ref"), false);
	});

	it("leaves detached HEAD untouched for manual reconciliation when its identity changes", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({
				headRefs: [null, null, "refs/heads/switched"],
				headReads: ["parent123", "parent123", "abc123456789"],
			}),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-detached-switch", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.equal(response.details.reason, "commit-reconciliation-required");
		assert.match(response.content[0].text, /detached HEAD identity changed/i);
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "update-ref"), false);
	});

	it("accepts an exactly verified direct transition without a stdout hash summary", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({ commitResult: result("commit completed\n") }),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-no-summary", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, true);
		assert.equal(response.details.hash, "abc123456789");
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "update-ref"), false);
	});

	it("does not report success when HEAD advances after the final target read", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({
				headReads: ["parent123", "parent123", "abc123456789", "abc123456789", "abc123456789", "intervening"],
			}),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-final-race", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.equal(response.details.reason, "commit-reconciliation-required");
		assert.match(response.content[0].text, /changed again|inspect/i);
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "update-ref"), false);
	});

	it("leaves a sibling commit untouched when its tree cannot be tied to this invocation", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({
				createdHash: "sibling123",
				headReads: ["parent123", "parent123", "sibling123"],
				committedTree: "tree-from-sibling",
			}),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-sibling", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.equal(response.details.reason, "commit-reconciliation-required");
		assert.equal(response.details.hash, "sibling123");
		assert.equal(response.details.target, "refs/heads/main");
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "update-ref"), false);
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "reset"), false);
		assert.match(response.content[0].text, /controlled workflow did not attempt (?:ref )?(?:recovery|rollback)/i);
		assert.match(response.content[0].text, /Git or hooks may already have advanced the captured target/i);
		assert.match(response.content[0].text, /inspect[^.]*before retrying[^.]*duplicate/i);
		assert.doesNotMatch(response.content[0].text, /HEAD was not rewritten/i);
	});

	it("leaves an ambiguous multi-parent transition untouched", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({ committedParents: ["parent123", "merge-parent"] }),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-ambiguous", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.reason, "commit-reconciliation-required");
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "update-ref"), false);
	});

	it("passes the abort signal to confirmation and checks it before commit", async () => {
		const controller = new AbortController();
		const harness = createHarness({
			confirm: async (_title, _message, options) => {
				assert.equal(options?.signal, controller.signal);
				controller.abort();
				return true;
			},
			exec: stagedExec(),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		await assert.rejects(
			tool.execute("commit-cancelled", { message: "fix: example" }, controller.signal, undefined, harness.ctx),
			(error: unknown) => error instanceof Error && error.name === "AbortError",
		);
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "commit"), false);
	});

	it("runs commit and successful reconciliation as a non-cancellable critical section", async () => {
		const controller = new AbortController();
		const delegate = stagedExec();
		const harness = createHarness({
			confirm: async () => true,
			exec: async (command, args, options) => {
				if (args[0] === "commit") controller.abort();
				return delegate(command, args, options);
			},
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-critical", { message: "fix: example" }, controller.signal, undefined, harness.ctx);

		assert.equal(response.details.committed, true);
		const commitIndex = harness.execCalls.findIndex(({ args }) => args[0] === "commit");
		assert.ok(commitIndex >= 0);
		assert.ok(harness.execCalls.slice(commitIndex).every(({ signal }) => signal === undefined));
	});

	it("never rolls back an advanced HEAD after a nonzero git result with a matching-looking summary", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({
				commitResult: result("[main abc1234] fix: example\n", 1, "hook reported failure"),
				committedMessage: "fix: changed after approval",
			}),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-nonzero-advanced", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.equal(response.details.reason, "commit-reconciliation-required");
		assert.equal(response.details.hash, "abc123456789");
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "update-ref"), false);
	});

	it("does not open approval when there are no staged changes", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: async (_command, args) => {
				const command = args.join(" ");
				if (command === "rev-parse --verify --quiet MERGE_HEAD") return result("", 1);
				if (command === "symbolic-ref --quiet HEAD") return result("refs/heads/main\n");
				if (command === "rev-parse --verify --quiet refs/heads/main") return result("parent123\n");
				if (command === "rev-parse --verify parent123^{tree}") return result("empty-tree\n");
				if (command === "write-tree") return result("empty-tree\n");
				if (command === "diff --name-status empty-tree empty-tree") return result();
				throw new Error(`Unexpected git args: ${command}`);
			},
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-5", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.match(response.content[0].text, /nothing staged/i);
		assert.equal(harness.confirmations.length, 0);
	});

	it("uses --no-verify only through the controlled tool when explicitly requested", async () => {
		const message = "fix: approved bypass";
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({ committedMessage: message }),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute(
			"commit-6",
			{ message, noVerify: true },
			undefined,
			undefined,
			harness.ctx,
		);

		assert.equal(response.details.committed, true);
		assert.match(harness.confirmations[0]?.message ?? "", /hooks.*bypass|bypass.*hooks/i);
		assert.match(harness.confirmations[0]?.message ?? "", /--no-verify/);
		const commit = harness.execCalls.find(({ args }) => args[0] === "commit");
		assert.deepEqual(commit?.args, ["commit", "--cleanup=verbatim", "--no-verify", "-m", message]);
	});

	it("leaves an observed root commit untouched when its message does not match approval", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({ priorHash: null, committedMessage: "fix: changed by hook" }),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-root-mismatch", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.equal(response.details.reason, "commit-reconciliation-required");
		assert.equal(response.details.hash, "abc123456789");
		assert.equal(response.details.target, "refs/heads/main");
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "update-ref"), false);
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "reset"), false);
	});

	it("refuses an active merge before confirmation without creating a merge commit", async () => {
		const cwd = createTemporaryRepository();
		try {
			const originalBranch = git(cwd, ["branch", "--show-current"]).trim();
			git(cwd, ["checkout", "--quiet", "-b", "feature"]);
			writeFileSync(join(cwd, "feature.txt"), "feature\n");
			git(cwd, ["add", "feature.txt"]);
			git(cwd, ["commit", "--quiet", "-m", "test: feature"]);
			git(cwd, ["checkout", "--quiet", originalBranch]);
			writeFileSync(join(cwd, "main.txt"), "main\n");
			git(cwd, ["add", "main.txt"]);
			git(cwd, ["commit", "--quiet", "-m", "test: main"]);
			git(cwd, ["merge", "--quiet", "--no-commit", "feature"]);
			const priorHash = git(cwd, ["rev-parse", "HEAD"]).trim();
			const harness = createHarness({ cwd, confirm: async () => true, exec: repositoryExec });
			const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

			const response = await tool.execute("commit-active-merge", { message: "fix: merge result" }, undefined, undefined, harness.ctx);

			assert.equal(response.details.committed, false);
			assert.equal(response.details.reason, "merge-in-progress");
			assert.match(response.content[0].text, /resolve|complete.*merge/i);
			assert.match(response.content[0].text, /outside.*controlled.*workflow/i);
			assert.equal(harness.confirmations.length, 0);
			assert.equal(harness.execCalls.some(({ args }) => args[0] === "commit"), false);
			assert.equal(git(cwd, ["rev-parse", "HEAD"]).trim(), priorHash);
			assert.ok(git(cwd, ["rev-parse", "--verify", "MERGE_HEAD"]).trim());
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("retains a verbatim message even when commit.cleanup=scissors would alter it", async () => {
		const cwd = createTemporaryRepository();
		try {
			writeFileSync(join(cwd, "approved.txt"), "approved change\n");
			git(cwd, ["add", "approved.txt"]);
			git(cwd, ["config", "commit.cleanup", "scissors"]);
			const approvedTree = git(cwd, ["write-tree"]).trim();
			const message = "fix: retain exact approval\n\n# ------------------------ >8 ------------------------\nThe complete body must survive.  ";
			const harness = createHarness({ cwd, confirm: async () => true, exec: repositoryExec });
			const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

			const response = await tool.execute("commit-integration-success", { message }, undefined, undefined, harness.ctx);

			assert.equal(response.details.committed, true);
			const rawCommit = git(cwd, ["cat-file", "commit", "HEAD"]);
			assert.match(rawCommit, new RegExp(`^tree ${approvedTree}$`, "m"));
			assert.equal(rawCommit.slice(rawCommit.indexOf("\n\n") + 2), `${message}\n`);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("blocks common direct commit wrappers while allowing non-mutating inspection", async () => {
		for (const command of [
			"git commit -m test",
			"cd repo && git -C . commit -m test",
			"command git commit --amend",
			"env git commit -m test",
			"env GIT_EDITOR=true git commit",
			"/usr/bin/git commit -m test",
			"exec git commit -m test",
			"sh -c 'git commit -m test'",
			"/bin/bash -lc \"env git commit -m test\"",
			"bash -lc 'sh -c \"exec /usr/bin/git commit -m test\"'",
		]) {
			assert.equal(isDirectGitCommitCommand(command), true, command);
		}
		for (const command of [
			"git status",
			"env git diff --cached",
			"/usr/bin/git log -1",
			"bash -lc 'git status && git diff'",
			"printf 'git commit'",
			"rg 'git commit' README.md",
		]) {
			assert.equal(isDirectGitCommitCommand(command), false, command);
		}

		const harness = createHarness();
		const blocked = await harness.handlers.get("tool_call")?.(
			{ toolName: "bash", input: { command: "env git commit -m test" } },
			harness.ctx,
		);
		const allowed = await harness.handlers.get("tool_call")?.(
			{ toolName: "bash", input: { command: "git status" } },
			harness.ctx,
		);

		assert.equal(blocked?.block, true);
		assert.match(blocked?.reason ?? "", /create_commit.*interactive approval/i);
		assert.equal(allowed, undefined);
	});
});
