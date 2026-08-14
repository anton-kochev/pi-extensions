import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import planTheme from "../extensions/plan-theme.ts";

const PLAN_THEME_PATH = fileURLToPath(new URL("../extensions/plan-theme.ts", import.meta.url));

function builtin(name: string) {
	return {
		name,
		description: name,
		parameters: {},
		promptGuidelines: [],
		sourceInfo: { source: "builtin", path: `<builtin:${name}>`, scope: "user", origin: "top-level" },
	};
}

function createHarness(
	options: {
		confirm?: (title: string, message: string) => Promise<boolean>;
		themeSwitchSucceeds?: boolean;
		isIdle?: boolean;
		branchEntries?: any[];
		hasUI?: boolean;
		cwd?: string;
	} = {},
) {
	const handlers = new Map<string, (event: any, ctx: any) => Promise<any>>();
	const branchEntries = options.branchEntries ?? [];
	const allTools = ["read", "grep", "find", "ls", "write", "edit", "bash"].map(builtin);
	let activeTools = allTools.map((tool) => tool.name);
	const entries: Array<{ customType: string; data: any }> = [];
	const registeredTools = new Map<string, any>();
	const notifications: Array<{ message: string; level: string }> = [];
	const pi = {
		on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
			handlers.set(name, handler);
		},
		appendEntry(customType: string, data: any) {
			entries.push({ customType, data });
		},
		sendMessage() {},
		getActiveTools: () => [...activeTools],
		getAllTools: () => allTools,
		setActiveTools(toolNames: string[]) {
			activeTools = [...toolNames];
		},
		registerTool(tool: any) {
			registeredTools.set(tool.name, tool);
			allTools.push({
				...tool,
				sourceInfo: { source: "package", path: PLAN_THEME_PATH, scope: "user", origin: "package" },
			});
		},
	};
	const ctx = {
		cwd: options.cwd ?? "/tmp/pi-plan-theme-test-project",
		mode: "tui",
		hasUI: options.hasUI ?? true,
		isIdle: () => options.isIdle ?? true,
		sessionManager: { getBranch: () => branchEntries },
		ui: {
			theme: { name: "dark" },
			getTheme: (name: string) => ({ name }),
			setTheme: () =>
				options.themeSwitchSucceeds === false
					? { success: false, error: "theme unavailable" }
					: { success: true },
			setFooter() {},
			setStatus() {},
			notify(message: string, level: string) {
				notifications.push({ message, level });
			},
			confirm: options.confirm ?? (async () => false),
		},
	};
	planTheme(pi as never);
	return {
		handlers,
		ctx,
		entries,
		branchEntries,
		allTools,
		registeredTools,
		notifications,
		getActiveTools: () => activeTools,
		setActiveTools: (toolNames: string[]) => pi.setActiveTools(toolNames),
	};
}

async function activatePlan(harness: ReturnType<typeof createHarness>) {
	await harness.handlers.get("input")?.(
		{ type: "input", source: "interactive", text: "/plan protect the project" },
		harness.ctx,
	);
}

describe("plan mode enforcement", () => {
	it("intercepts package prompt and skill --help/-h before expansion", async () => {
		for (const [command, usage] of [
			["/plan", "Usage: /plan <task>"],
			["/srs", "Usage: /srs <request>"],
			["/skill:tdd", "Usage: /skill:tdd [task context]"],
		] as const) {
			for (const alias of ["--help", "-h"]) {
				const harness = createHarness();
				const normalTools = harness.getActiveTools();

				const result = await harness.handlers.get("input")?.(
					{ type: "input", source: "interactive", text: `${command} ${alias}` },
					harness.ctx,
				);

				assert.deepEqual(result, { action: "handled" });
				assert.equal(harness.notifications.length, 1);
				assert.equal(harness.notifications[0]?.level, "info");
				assert.match(harness.notifications[0]?.message ?? "", new RegExp(usage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
				assert.match(harness.notifications[0]?.message ?? "", /--help, -h/);
				assert.equal(harness.entries.length, 0);
				assert.deepEqual(harness.getActiveTools(), normalTools);
			}
		}
	});

	it("refuses to activate Plan mode while another agent turn is running", async () => {
		const harness = createHarness();

		const result = await harness.handlers.get("input")?.(
			{
				type: "input",
				source: "interactive",
				text: "/plan protect the project",
				streamingBehavior: "steer",
			},
			harness.ctx,
		);

		assert.deepEqual(result, { action: "handled" });
		assert.equal(harness.entries.some((entry) => entry.data.active), false);
		assert.deepEqual(harness.getActiveTools(), ["read", "grep", "find", "ls", "write", "edit", "bash"]);
	});

	it("fails closed when the runtime reports a busy agent without streaming metadata", async () => {
		const harness = createHarness({ isIdle: false });

		const result = await harness.handlers.get("input")?.(
			{ type: "input", source: "interactive", text: "/plan protect the project" },
			harness.ctx,
		);

		assert.deepEqual(result, { action: "handled" });
		assert.equal(harness.entries.some((entry) => entry.data.active), false);
	});

	it("keeps the internal plan creator hidden outside Plan mode", async () => {
		const harness = createHarness();
		harness.setActiveTools([...harness.getActiveTools(), "create_plan"]);

		await harness.handlers.get("session_start")?.({ type: "session_start" }, harness.ctx);

		assert.equal(harness.getActiveTools().includes("create_plan"), false);
	});

	it("restores normal tools when switching from Plan mode to an inactive session", async () => {
		const harness = createHarness();
		const normalTools = harness.getActiveTools();
		await activatePlan(harness);

		await harness.handlers.get("session_start")?.({ type: "session_start" }, harness.ctx);

		assert.deepEqual(harness.getActiveTools(), normalTools);
	});

	it("restores active Plan mode from the current session branch", async () => {
		const harness = createHarness({
			branchEntries: [
			{
				type: "custom",
				customType: "plan-theme-state",
				data: { active: true, planPath: ".pi/plans/restored.md", previousThemeName: "dark" },
			},
		],
		});

		await harness.handlers.get("session_start")?.({ type: "session_start" }, harness.ctx);
		const result = await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "write-source", toolName: "write", input: { path: "src/app.ts" } },
			harness.ctx,
		);

		assert.equal(result?.block, true);
		assert.deepEqual(harness.getActiveTools(), ["read", "grep", "find", "ls", "create_plan"]);
	});

	it("does not restore the internal plan creator from legacy active state", async () => {
		const harness = createHarness({
			branchEntries: [
				{
					type: "custom",
					customType: "plan-theme-state",
					data: {
						active: true,
						planPath: ".pi/plans/2026-08-09-230000-restored.md",
						previousThemeName: "dark",
						saveAuthorized: true,
					},
				},
			],
		});
		harness.setActiveTools([...harness.getActiveTools(), "create_plan"]);
		await harness.handlers.get("session_start")?.({ type: "session_start" }, harness.ctx);
		const call = {
			type: "tool_call",
			toolCallId: "create-restored-plan",
			toolName: "create_plan",
			input: { content: "# Restored plan" },
		};

		await harness.handlers.get("tool_call")?.(call, harness.ctx);
		await harness.handlers.get("tool_result")?.({ ...call, type: "tool_result", isError: false }, harness.ctx);

		assert.equal(harness.getActiveTools().includes("create_plan"), false);
	});

	it("restores prior tools and save authorization with an active Plan session", async () => {
		let confirmations = 0;
		const harness = createHarness({
			confirm: async () => {
				confirmations += 1;
				return false;
			},
			branchEntries: [
			{
				type: "custom",
				customType: "plan-theme-state",
				data: {
					active: true,
					planPath: ".pi/plans/restored.md",
					previousThemeName: "dark",
					previousToolNames: ["read", "bash"],
					saveAuthorized: true,
				},
			},
		],
		});
		await harness.handlers.get("session_start")?.({ type: "session_start" }, harness.ctx);
		const call = {
			type: "tool_call",
			toolCallId: "create-restored-plan",
			toolName: "create_plan",
			input: { content: "# Restored plan" },
		};

		const result = await harness.handlers.get("tool_call")?.(call, harness.ctx);
		await harness.handlers.get("tool_result")?.({ ...call, type: "tool_result", isError: false }, harness.ctx);

		assert.equal(result?.block, undefined);
		assert.equal(confirmations, 0);
		assert.deepEqual(harness.getActiveTools(), ["read", "bash"]);
	});

	it("remains enforced when switching to the Plan theme fails", async () => {
		const harness = createHarness({ themeSwitchSucceeds: false });
		await activatePlan(harness);

		const result = await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "write-source", toolName: "write", input: { path: "src/app.ts" } },
			harness.ctx,
		);

		assert.equal(result?.block, true);
		assert.equal(harness.entries.at(-1)?.data.active, true);
		assert.deepEqual(harness.getActiveTools(), ["read", "grep", "find", "ls", "create_plan"]);
	});

	it("hides mutating and custom tools while retaining the controlled plan writer", async () => {
		const harness = createHarness();
		await activatePlan(harness);

		assert.deepEqual(harness.getActiveTools(), ["read", "grep", "find", "ls", "create_plan"]);
	});

	it("blocks source-file writes while planning", async () => {
		const harness = createHarness();
		await activatePlan(harness);

		const result = await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "write-source", toolName: "write", input: { path: "src/app.ts" } },
			harness.ctx,
		);

		assert.equal(result?.block, true);
		assert.match(result?.reason ?? "", /read-only/i);
	});

	it("asks before creating the plan and stays read-only when the user continues planning", async () => {
		const dialogs: Array<[string, string]> = [];
		const harness = createHarness({
			confirm: async (title, message) => {
				dialogs.push([title, message]);
				return false;
			},
		});
		await activatePlan(harness);
		const result = await harness.handlers.get("tool_call")?.(
			{
				type: "tool_call",
				toolCallId: "create-plan",
				toolName: "create_plan",
				input: { content: "# Plan" },
			},
			harness.ctx,
		);

		assert.equal(result?.block, true);
		assert.match(result?.reason ?? "", /continue planning/i);
		assert.equal(dialogs.length, 1);
		assert.match(dialogs[0]?.join(" ") ?? "", /create.*plan/i);
		assert.equal(harness.entries.at(-1)?.data.active, true);
	});

	it("exits Plan mode and restores the previous tools after an approved plan is written", async () => {
		const harness = createHarness({ confirm: async () => true });
		const previousTools = harness.getActiveTools();
		await activatePlan(harness);
		const call = {
			type: "tool_call",
			toolCallId: "create-plan",
			toolName: "create_plan",
			input: { content: "# Plan" },
		};

		const result = await harness.handlers.get("tool_call")?.(call, harness.ctx);
		assert.equal(result?.block, undefined);
		await harness.handlers.get("tool_result")?.({ ...call, type: "tool_result", isError: false }, harness.ctx);

		assert.equal(harness.entries.at(-1)?.data.active, false);
		assert.deepEqual(harness.getActiveTools(), previousTools);
	});

	it("atomically advances a late collision through the controlled plan creator", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "pi-plan-theme-"));
		try {
			const harness = createHarness({ confirm: async () => true, cwd });
			await activatePlan(harness);
			const generatedPath = harness.entries.at(-1)?.data.planPath as string;
			await mkdir(dirname(join(cwd, generatedPath)), { recursive: true });
			await writeFile(join(cwd, generatedPath), "existing plan");
			const call = {
				type: "tool_call",
				toolCallId: "create-plan",
				toolName: "create_plan",
				input: { content: "# New plan" },
			};
			await harness.handlers.get("tool_call")?.(call, harness.ctx);

			const tool = harness.registeredTools.get("create_plan");
			const result = await tool.execute(call.toolCallId, call.input, undefined, undefined, harness.ctx);

			assert.notEqual(result.details.path, generatedPath);
			assert.equal(await readFile(join(cwd, generatedPath), "utf8"), "existing plan");
			assert.equal(await readFile(join(cwd, result.details.path), "utf8"), "# New plan");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("keeps Plan mode active when interactive approval is unavailable", async () => {
		let confirmations = 0;
		const harness = createHarness({
			hasUI: false,
			confirm: async () => {
				confirmations += 1;
				return true;
			},
		});
		await activatePlan(harness);

		const result = await harness.handlers.get("input")?.(
			{ type: "input", source: "interactive", text: "/plan" },
			harness.ctx,
		);

		assert.deepEqual(result, { action: "handled" });
		assert.equal(confirmations, 0);
		assert.equal(harness.entries.at(-1)?.data.active, true);
	});

	it("re-running the Plan command authorizes the next plan write without asking twice", async () => {
		let confirmations = 0;
		const harness = createHarness({
			confirm: async () => {
				confirmations += 1;
				return true;
			},
		});
		await activatePlan(harness);
		const commandResult = await harness.handlers.get("input")?.(
			{ type: "input", source: "interactive", text: "/plan" },
			harness.ctx,
		);
		const writeResult = await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "create-plan", toolName: "create_plan", input: { content: "# Plan" } },
			harness.ctx,
		);

		assert.equal(commandResult?.action, "transform");
		assert.match(commandResult?.text ?? "", /creation succeeds, implement the saved plan/);
		assert.equal(writeResult?.block, undefined);
		assert.equal(confirmations, 1);
	});

	it("stays read-only without locking Plan mode when interactive confirmation fails", async () => {
		const harness = createHarness({
			confirm: async () => {
				throw new Error("dialog failed");
			},
		});
		await activatePlan(harness);

		const writeResult = await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "create-plan", toolName: "create_plan", input: { content: "# Plan" } },
			harness.ctx,
		);
		const readResult = await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "read-source", toolName: "read", input: { path: "README.md" } },
			harness.ctx,
		);

		assert.equal(writeResult?.block, true);
		assert.match(writeResult?.reason ?? "", /approval.*failed/i);
		assert.equal(readResult?.block, undefined);
	});

	it("uses one confirmation and blocks concurrent calls while approval is pending", async () => {
		let confirmations = 0;
		let resolveConfirmation: ((approved: boolean) => void) | undefined;
		const confirmation = new Promise<boolean>((resolve) => {
			resolveConfirmation = resolve;
		});
		const harness = createHarness({
			confirm: async () => {
				confirmations += 1;
				return confirmation;
			},
		});
		await activatePlan(harness);
		const first = harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "create-plan-1", toolName: "create_plan", input: { content: "# Plan" } },
			harness.ctx,
		);
		await new Promise((resolve) => setImmediate(resolve));

		const sibling = harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "create-plan-2", toolName: "create_plan", input: { content: "# Plan" } },
			harness.ctx,
		);
		await new Promise((resolve) => setImmediate(resolve));
		resolveConfirmation?.(true);

		assert.equal(confirmations, 1);
		assert.equal((await first)?.block, undefined);
		assert.equal((await sibling)?.block, true);
	});

	it("locks the approved plan-write arguments against later extension mutation", async () => {
		const harness = createHarness({ confirm: async () => true });
		await activatePlan(harness);
		const call = {
			type: "tool_call",
			toolCallId: "create-plan",
			toolName: "create_plan",
			input: { content: "# Plan" },
		};

		await harness.handlers.get("tool_call")?.(call, harness.ctx);

		assert.throws(() => {
			call.input.content = "mutated plan";
		}, TypeError);
		assert.equal(Reflect.set(call, "input", { content: "mutated plan" }), false);
		assert.equal(call.input.content, "# Plan");
	});

	it("blocks sibling tool calls while the approved plan write is in progress", async () => {
		const harness = createHarness({ confirm: async () => true });
		await activatePlan(harness);

		await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "create-plan-1", toolName: "create_plan", input: { content: "# Plan" } },
			harness.ctx,
		);
		const sibling = await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "create-plan-2", toolName: "create_plan", input: { content: "# Plan" } },
			harness.ctx,
		);

		assert.equal(sibling?.block, true);
		assert.match(sibling?.reason ?? "", /save.*in progress/i);
	});

	it("recovers from an interrupted plan write when the user continues planning", async () => {
		const decisions = [true, false];
		const harness = createHarness({ confirm: async () => decisions.shift() ?? false });
		await activatePlan(harness);
		await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "interrupted-write", toolName: "create_plan", input: { content: "# Plan" } },
			harness.ctx,
		);

		await harness.handlers.get("input")?.(
			{ type: "input", source: "interactive", text: "/plan" },
			harness.ctx,
		);
		const readResult = await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "read-after-interruption", toolName: "read", input: { path: "README.md" } },
			harness.ctx,
		);

		assert.equal(readResult?.block, undefined);
		assert.equal(harness.entries.at(-1)?.data.active, true);
		assert.equal(harness.entries.at(-1)?.data.saveAuthorized, false);
	});

	it("stays in Plan mode and retains approval when the plan write fails", async () => {
		let confirmations = 0;
		const harness = createHarness({
			confirm: async () => {
				confirmations += 1;
				return true;
			},
		});
		await activatePlan(harness);
		const firstCall = {
			type: "tool_call",
			toolCallId: "create-plan-1",
			toolName: "create_plan",
			input: { content: "# Plan" },
		};

		await harness.handlers.get("tool_call")?.(firstCall, harness.ctx);
		await harness.handlers.get("tool_result")?.({ ...firstCall, type: "tool_result", isError: true }, harness.ctx);
		const retry = await harness.handlers.get("tool_call")?.(
			{ ...firstCall, toolCallId: "write-plan-2" },
			harness.ctx,
		);

		assert.equal(retry?.block, undefined);
		assert.equal(confirmations, 1);
		assert.equal(harness.entries.at(-1)?.data.active, true);
		assert.equal(harness.entries.at(-1)?.data.saveAuthorized, true);
		assert.deepEqual(harness.getActiveTools(), ["read", "grep", "find", "ls", "create_plan"]);
	});

	it("blocks an overridden writer without asking it to create the plan", async () => {
		let confirmations = 0;
		const harness = createHarness({
			confirm: async () => {
				confirmations += 1;
				return true;
			},
		});
		const write = harness.allTools.find((tool) => tool.name === "write");
		assert.ok(write);
		write.sourceInfo.source = "package";
		write.sourceInfo.path = "/extensions/untrusted-write.ts";
		await activatePlan(harness);
		const planPath = harness.entries.at(-1)?.data.planPath;

		const result = await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "custom-write", toolName: "write", input: { path: planPath } },
			harness.ctx,
		);

		assert.equal(result?.block, true);
		assert.match(result?.reason ?? "", /read-only/i);
		assert.equal(confirmations, 0);
	});

	it("blocks a custom tool that overrides a read-only built-in", async () => {
		const harness = createHarness();
		const read = harness.allTools.find((tool) => tool.name === "read");
		assert.ok(read);
		read.sourceInfo.source = "package";
		read.sourceInfo.path = "/extensions/untrusted-read.ts";
		await activatePlan(harness);

		const result = await harness.handlers.get("tool_call")?.(
			{ type: "tool_call", toolCallId: "custom-read", toolName: "read", input: { path: "README.md" } },
			harness.ctx,
		);

		assert.equal(result?.block, true);
		assert.match(result?.reason ?? "", /read-only/i);
	});

	it("blocks user shell commands while planning", async () => {
		const harness = createHarness();
		await activatePlan(harness);

		const result = await harness.handlers.get("user_bash")?.(
			{ type: "user_bash", command: "rm -rf src", excludeFromContext: false, cwd: harness.ctx.cwd },
			harness.ctx,
		);

		assert.equal(result?.result?.exitCode, 126);
		assert.match(result?.result?.output ?? "", /Plan mode.*read-only/i);
	});

	it("blocks editing, shell execution, and custom tools while planning", async () => {
		const harness = createHarness();
		await activatePlan(harness);

		for (const [toolName, input] of [
			["edit", { path: "src/app.ts" }],
			["bash", { command: "rm -rf src" }],
			["guild_handover", { member: "csharp-coder", task: "edit the project" }],
		] as const) {
			const result = await harness.handlers.get("tool_call")?.(
				{ type: "tool_call", toolCallId: toolName, toolName, input },
				harness.ctx,
			);

			assert.equal(result?.block, true, `${toolName} should be blocked`);
			assert.match(result?.reason ?? "", /read-only/i);
		}
	});
});
