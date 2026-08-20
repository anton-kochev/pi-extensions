import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createAtlasFooter, registerAtlasFooter } from "../src/footer.ts";

const plainTheme = {
	fg: (_color: string, text: string) => text,
};

function createRegistrationHarness(branch: readonly unknown[] = [], mode = "tui") {
	const sessionStartHandlers: Array<(event: unknown, ctx: any) => unknown> = [];
	const sessionShutdownHandlers: Array<(event: unknown, ctx: any) => unknown> = [];
	let sessionName = "runtime-session";
	const pi = {
		on(name: string, handler: (event: unknown, ctx: any) => unknown) {
			if (name === "session_start") sessionStartHandlers.push(handler);
			if (name === "session_shutdown") sessionShutdownHandlers.push(handler);
		},
		getSessionName: () => sessionName,
	};
	registerAtlasFooter(pi as never);

	let installedFooter: unknown;
	const installations: unknown[] = [];
	const ui = {
		setFooter(factory: unknown) {
			installedFooter = factory;
			installations.push(factory);
		},
	};
	const originalSetFooter = ui.setFooter;
	const context = {
		mode,
		cwd: "/repo",
		model: { provider: "provider", id: "model" },
		thinkingLevel: "high",
		sessionManager: { getBranch: () => branch },
		ui,
	};

	return {
		context,
		installations,
		originalSetFooter,
		get installedFooter() { return installedFooter; },
		setSessionName(name: string) { sessionName = name; },
		onSessionStart(handler: (event: unknown, ctx: any) => unknown) {
			sessionStartHandlers.push(handler);
		},
		async start() {
			await Promise.all(sessionStartHandlers.map((handler) => handler({ reason: "startup" }, context)));
			await Promise.resolve();
		},
		async shutdown(reason = "quit") {
			await Promise.all(sessionShutdownHandlers.map((handler) => handler({ reason }, context)));
			await Promise.resolve();
		},
		registerReloadedAtlas() {
			registerAtlasFooter(pi as never);
		},
		clearLifecycleHandlers() {
			sessionStartHandlers.length = 0;
			sessionShutdownHandlers.length = 0;
		},
		get setter() { return context.ui.setFooter; },
	};
}

describe("Atlas runtime footer", () => {
	it("renders working context and model identity on one wide line", () => {
		const footer = createAtlasFooter(
			{ requestRender() {} } as never,
			plainTheme as never,
			{
				getGitBranch: () => "main",
				getExtensionStatuses: () => new Map(),
				onBranchChange: () => () => {},
			} as never,
			() => ({
				cwd: "/workspace/project",
				sessionName: "neon-pager-reboot",
				model: { provider: "openai-codex", id: "gpt-5.6-sol" },
				thinkingLevel: "high",
			}),
		);

		const [line] = footer.render(100);
		const left = "/workspace/project (main) • neon-pager-reboot";
		const right = "(openai-codex) gpt-5.6-sol • high";
		assert.equal(line, left + " ".repeat(100 - visibleWidth(left) - visibleWidth(right)) + right);
	});

	it("drops the provider before model identity and remains bounded at zero and narrow ANSI widths", () => {
		const ansiTheme = {
			fg: (_color: string, text: string) => `\u001b[2m${text}\u001b[22m`,
		};
		const footer = createAtlasFooter(
			{ requestRender() {} } as never,
			ansiTheme as never,
			{
				getGitBranch: () => "feature/very-long-branch",
				getExtensionStatuses: () => new Map(),
				onBranchChange: () => () => {},
			} as never,
			() => ({
				cwd: "/workspace/a-very-long-project-name",
				sessionName: "a-very-long-session-name",
				model: { provider: "openai-codex", id: "gpt-5.6-sol" },
				thinkingLevel: "high",
			}),
		);

		assert.deepEqual(footer.render(0), [""]);
		assert.equal(stripVTControlCharacters(footer.render(18)[0] ?? ""), "gpt-5.6-sol • high");
		for (const width of [0, 1, 2, 5, 18, 40]) {
			for (const line of footer.render(width)) assert.ok(visibleWidth(line) <= width);
		}
	});

	it("sanitizes malicious newlines, CSI, OSC, and terminal controls before width accounting", () => {
		const footer = createAtlasFooter(
			{ requestRender() {} } as never,
			plainTheme as never,
			{
				getGitBranch: () => "main\rbranch\u001b]2;branch-title\u0007",
				getExtensionStatuses: () => new Map(),
				onBranchChange: () => () => {},
			} as never,
			() => ({
				cwd: "/repo\ncwd\u001b[31m-csi\u001b[0m",
				sessionName: "session\tname\u001b]8;;https://example.invalid\u0007-link\u001b]8;;\u0007",
				model: {
					provider: "pro\u0000vider\u001b[2J",
					id: "mod\u007fel\u009b31m-red\u009b0m",
				},
				thinkingLevel: "hi\u0008gh\u001b]0;reasoning-title\u001b\\",
			}),
		);

		const [wideLine] = footer.render(160);
		assert.equal(
			wideLine,
			"/repo cwd-csi (main branch) • session name-link"
				+ " ".repeat(160 - visibleWidth("/repo cwd-csi (main branch) • session name-link") - visibleWidth("(pro vider) mod el-red • hi gh"))
				+ "(pro vider) mod el-red • hi gh",
		);
		assert.doesNotMatch(wideLine ?? "", /[\u0000-\u001f\u007f-\u009f]/u);

		for (const width of [0, 1, 5, 18, 40, 80]) {
			for (const line of footer.render(width)) {
				assert.doesNotMatch(stripVTControlCharacters(line), /[\u0000-\u001f\u007f-\u009f]/u);
				assert.ok(visibleWidth(line) <= width);
			}
		}
	});

	it("renders every extension status on its own bounded line without accounting noise", () => {
		const statuses = new Map([
			["zeta", "\u001b[33mbeta\tworking now\u001b[0m"],
			["alpha", "\u001b[32malpha\nready\u001b[0m"],
		]);
		const footer = createAtlasFooter(
			{ requestRender() {} } as never,
			plainTheme as never,
			{
				getGitBranch: () => null,
				getExtensionStatuses: () => statuses,
				onBranchChange: () => () => {},
			} as never,
			() => ({
				cwd: "/repo",
				model: { provider: "anthropic", id: "claude-sonnet" },
				thinkingLevel: "off",
			}),
		);

		const lines = footer.render(80);
		assert.deepEqual(lines.slice(1).map(stripVTControlCharacters), ["alpha ready", "beta working now"]);
		assert.doesNotMatch(lines.join("\n"), /↑|↓|cache|CH\d|\$\d|sub\)|context|auto/i);
		assert.equal(footer.render(8).length, 3);
		for (const line of footer.render(8)) assert.ok(visibleWidth(line) <= 8);
	});

	it("rerenders on Git branch changes and reads current session context on every render", () => {
		let branch = "main";
		let notifyBranchChange = () => {};
		let renderRequests = 0;
		let sessionName = "first-session";
		let modelId = "first-model";
		let disposed = false;
		const footer = createAtlasFooter(
			{ requestRender: () => { renderRequests += 1; } } as never,
			plainTheme as never,
			{
				getGitBranch: () => branch,
				getExtensionStatuses: () => new Map(),
				onBranchChange(callback: () => void) {
					notifyBranchChange = callback;
					return () => { disposed = true; };
				},
			} as never,
			() => ({
				cwd: "/repo",
				sessionName,
				model: { provider: "provider", id: modelId },
				thinkingLevel: "high",
			}),
		);

		assert.match(footer.render(80)[0] ?? "", /main.*first-session.*first-model/);
		branch = "next";
		sessionName = "second-session";
		modelId = "second-model";
		notifyBranchChange();
		assert.equal(renderRequests, 1);
		assert.match(footer.render(80)[0] ?? "", /next.*second-session.*second-model/);
		footer.dispose();
		assert.equal(disposed, true);
	});

	it("preserves a custom footer installed after Atlas during the same startup", async () => {
		const harness = createRegistrationHarness();
		const customFooter = () => ({ render: () => ["custom"], invalidate() {} });
		harness.onSessionStart((_event, ctx) => ctx.ui.setFooter(customFooter));

		await harness.start();

		assert.deepEqual(harness.installations, [customFooter]);
		assert.equal(harness.installedFooter, customFooter);
	});

	it("removes its wrapper on shutdown and makes stale captured setters unable to reinstall Atlas", async () => {
		const harness = createRegistrationHarness();
		await harness.start();
		const staleAtlasFooter = harness.installedFooter;
		const staleSetter = harness.setter;

		await harness.shutdown("reload");
		assert.equal(harness.setter, harness.originalSetFooter);
		assert.equal(harness.installedFooter, undefined);

		staleSetter(undefined);
		assert.equal(harness.installedFooter, undefined);
		assert.notEqual(harness.installedFooter, staleAtlasFooter);
	});

	it("does not run a deferred fallback after shutdown removes Atlas", async () => {
		const harness = createRegistrationHarness();
		const startup = harness.start();
		const shutdown = harness.shutdown("reload");

		await Promise.all([startup, shutdown]);

		assert.equal(harness.setter, harness.originalSetFooter);
		assert.deepEqual(harness.installations, [undefined]);
		assert.equal(harness.installedFooter, undefined);
	});

	it("reloads with one live wrapper and ignores the prior runtime's stale fallback", async () => {
		const harness = createRegistrationHarness();
		await harness.start();
		const firstAtlasFooter = harness.installedFooter;
		const staleSetter = harness.setter;
		await harness.shutdown("reload");

		harness.clearLifecycleHandlers();
		harness.registerReloadedAtlas();
		await harness.start();
		const reloadedAtlasFooter = harness.installedFooter;
		assert.notEqual(reloadedAtlasFooter, firstAtlasFooter);

		staleSetter(undefined);
		assert.equal(harness.installedFooter, reloadedAtlasFooter);
		assert.notEqual(harness.installedFooter, firstAtlasFooter);
	});

	it("replaces surviving Atlas ownership instead of accumulating wrappers", async () => {
		const harness = createRegistrationHarness();
		await harness.start();
		const firstAtlasFooter = harness.installedFooter;
		const staleSetter = harness.setter;

		harness.clearLifecycleHandlers();
		harness.registerReloadedAtlas();
		await harness.start();
		const replacementAtlasFooter = harness.installedFooter;
		assert.notEqual(replacementAtlasFooter, firstAtlasFooter);

		staleSetter(undefined);
		assert.equal(harness.installedFooter, replacementAtlasFooter);
	});

	it("preserves a Plan footer installed before Atlas and restores Atlas on Plan exit", async () => {
		const harness = createRegistrationHarness([
			{ type: "custom", customType: "plan-theme-state", data: { active: true } },
		]);
		const planFooter = () => ({ render: () => ["Plan"], invalidate() {} });
		harness.context.ui.setFooter(planFooter);

		await harness.start();
		assert.equal(harness.installedFooter, planFooter);
		harness.context.ui.setFooter(undefined);
		assert.notEqual(harness.installedFooter, planFooter);
		assert.equal(typeof harness.installedFooter, "function");
	});

	it("allows Plan to override Atlas after startup and restores Atlas for active or indeterminate state", async () => {
		for (const branch of [
			[{ type: "custom", customType: "plan-theme-state", data: { active: true } }],
			[{ type: "custom", customType: "plan-theme-state", data: {} }],
		]) {
			const harness = createRegistrationHarness(branch);
			const planFooter = () => ({ render: () => ["Plan"], invalidate() {} });
			await harness.start();
			assert.equal(harness.installedFooter, undefined);
			harness.context.ui.setFooter(planFooter);
			assert.equal(harness.installedFooter, planFooter);
			harness.context.ui.setFooter(undefined);
			assert.equal(typeof harness.installedFooter, "function");
		}
	});

	it("restores Atlas after any temporary custom footer clears itself", async () => {
		const harness = createRegistrationHarness();
		await harness.start();
		const atlasFooter = harness.installedFooter;
		const temporaryFooter = () => ({ render: () => ["temporary"], invalidate() {} });

		harness.context.ui.setFooter(temporaryFooter);
		assert.equal(harness.installedFooter, temporaryFooter);
		harness.context.ui.setFooter(undefined);
		assert.equal(harness.installedFooter, atlasFooter);
	});

	it("does not install or wrap a footer outside TUI mode", async () => {
		const harness = createRegistrationHarness([], "rpc");
		await harness.start();

		assert.deepEqual(harness.installations, []);
		assert.equal(harness.context.ui.setFooter, harness.originalSetFooter);
	});
});
