import assert from "node:assert/strict";
import { describe, it } from "node:test";
import registerCommitWorkflow, {
	CREATE_COMMIT_TOOL_NAME,
	isDirectGitCommitCommand,
} from "../src/commit.ts";

type ExecCall = { command: string; args: string[]; cwd?: string };
type ExecResult = { stdout: string; stderr: string; code: number; killed: boolean };

function result(stdout = "", code = 0, stderr = ""): ExecResult {
	return { stdout, stderr, code, killed: false };
}

function createHarness(options: {
	hasUI?: boolean;
	confirm?: (title: string, message: string) => Promise<boolean>;
	exec?: (command: string, args: string[], options?: { cwd?: string }) => Promise<ExecResult>;
} = {}) {
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const handlers = new Map<string, (event: any, ctx: any) => Promise<any> | any>();
	const execCalls: ExecCall[] = [];
	const confirmations: Array<{ title: string; message: string }> = [];
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
		async exec(command: string, args: string[], execOptions?: { cwd?: string }) {
			execCalls.push({ command, args, cwd: execOptions?.cwd });
			return options.exec?.(command, args, execOptions) ?? result();
		},
	};
	const ctx = {
		cwd: "/workspace/project",
		hasUI: options.hasUI ?? true,
		ui: {
			async confirm(title: string, message: string) {
				confirmations.push({ title, message });
				return options.confirm?.(title, message) ?? false;
			},
		},
	};
	registerCommitWorkflow(pi as never);
	return { tools, commands, handlers, execCalls, confirmations, ctx };
}

function stagedExec(options: {
	rawSnapshots?: string[];
	commitResult?: ExecResult;
	log?: string;
} = {}) {
	const snapshots = [...(options.rawSnapshots ?? [":100644 100644 a b M\tfile.ts\n"] )];
	return async (_command: string, args: string[]): Promise<ExecResult> => {
		if (args.join(" ") === "diff --cached --name-status") return result("M\tfile.ts\n");
		if (args.join(" ") === "diff --cached --raw --no-abbrev") {
			return result(snapshots.shift() ?? snapshots.at(-1) ?? "");
		}
		if (args[0] === "commit") return options.commitResult ?? result("[main abc1234] fix: example\n");
		if (args.join(" ") === "log -1 --format=%H%n%s") {
			return result(options.log ?? "abc123456789\nfix: example\n");
		}
		throw new Error(`Unexpected git args: ${args.join(" ")}`);
	};
}

describe("controlled commit tool", () => {
	it("registers a sequential create_commit tool", () => {
		const harness = createHarness();
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		assert.ok(tool);
		assert.equal(tool.executionMode, "sequential");
		assert.deepEqual(tool.parameters.required, ["message"]);
	});

	it("leaves staged changes intact when interactive approval is declined", async () => {
		const harness = createHarness({
			confirm: async () => false,
			exec: stagedExec(),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-1", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.match(response.content[0].text, /cancelled/i);
		assert.equal(harness.confirmations.length, 1);
		assert.match(harness.confirmations[0]?.title ?? "", /create.*commit/i);
		assert.match(harness.confirmations[0]?.message ?? "", /fix: example/);
		assert.match(harness.confirmations[0]?.message ?? "", /M\s+file\.ts/);
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

	it("commits the approved message only after confirming the staged snapshot", async () => {
		const sequence: string[] = [];
		const exec = stagedExec({
			rawSnapshots: ["snapshot\n", "snapshot\n"],
			log: "abc123456789\nfix: approved change\n",
		});
		const harness = createHarness({
			confirm: async () => {
				sequence.push("confirm");
				return true;
			},
			exec: async (command, args) => {
				sequence.push(args[0] ?? "exec");
				return exec(command, args);
			},
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute(
			"commit-3",
			{ message: "  fix: approved change  " },
			undefined,
			undefined,
			harness.ctx,
		);

		assert.equal(response.details.committed, true);
		assert.equal(response.details.hash, "abc123456789");
		assert.deepEqual(sequence, ["diff", "diff", "confirm", "diff", "commit", "log"]);
		const commit = harness.execCalls.find(({ args }) => args[0] === "commit");
		assert.deepEqual(commit?.args, ["commit", "-m", "fix: approved change"]);
		assert.equal(commit?.cwd, harness.ctx.cwd);
	});

	it("aborts when the staged snapshot changes during confirmation", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: stagedExec({ rawSnapshots: ["before\n", "after\n"] }),
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-4", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.match(response.content[0].text, /staged changes changed/i);
		assert.equal(harness.execCalls.some(({ args }) => args[0] === "commit"), false);
	});

	it("does not open approval when there are no staged changes", async () => {
		const harness = createHarness({
			confirm: async () => true,
			exec: async (_command, args) => {
				if (args.join(" ") === "diff --cached --name-status") return result();
				throw new Error(`Unexpected git args: ${args.join(" ")}`);
			},
		});
		const tool = harness.tools.get(CREATE_COMMIT_TOOL_NAME);

		const response = await tool.execute("commit-5", { message: "fix: example" }, undefined, undefined, harness.ctx);

		assert.equal(response.details.committed, false);
		assert.match(response.content[0].text, /nothing staged/i);
		assert.equal(harness.confirmations.length, 0);
	});

	it("blocks direct model-issued git commits in favor of create_commit", async () => {
		for (const command of [
			"git commit -m test",
			"cd repo && git -C . commit -m test",
			"command git commit --amend",
		]) {
			assert.equal(isDirectGitCommitCommand(command), true, command);
		}
		for (const command of ["git status", "printf 'git commit'", "rg 'git commit' README.md"]) {
			assert.equal(isDirectGitCommitCommand(command), false, command);
		}

		const harness = createHarness();
		const blocked = await harness.handlers.get("tool_call")?.(
			{ toolName: "bash", input: { command: "git commit -m test" } },
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
