import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import atlas from "../extensions/index.ts";

function createHarness() {
	const commands = new Map<string, any>();
	const tools = new Map<string, any>();
	const handlers = new Map<string, any[]>();
	const messages: Array<{ message: any; options: any }> = [];
	const sessionNames: string[] = [];
	atlas({
		registerCommand(name: string, definition: any) { commands.set(name, definition); },
		registerTool(definition: any) { tools.set(definition.name, definition); },
		on(name: string, handler: any) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
		sendMessage(message: any, options: any) { messages.push({ message, options }); },
		setSessionName(name: string) { sessionNames.push(name); },
		getSessionName() { return sessionNames.at(-1); },
		getCommands() { return []; },
		getAllTools() { return []; },
	} as never);
	return { commands, tools, handlers, messages, sessionNames };
}

describe("Atlas extension", () => {
	it("leaves a fresh session unnamed until the user sends its first message", async () => {
		const { handlers, sessionNames } = createHarness();
		const ctx = {
			modelRegistry: { getAvailable: () => [] },
			scopedModels: [],
			sessionManager: {
				getEntries: () => [
					{ type: "model_change" },
					{ type: "thinking_level_change" },
				],
				getSessionFile: () => "/does/not/exist/fresh.jsonl",
			},
		};

		for (const handler of handlers.get("session_start") ?? []) {
			await handler({ reason: "startup" }, ctx);
		}
		assert.deepEqual(sessionNames, []);

		for (const handler of handlers.get("message_start") ?? []) {
			await handler({ message: { role: "user" } }, ctx);
		}
		assert.equal(sessionNames.length, 1);
		assert.match(sessionNames[0] ?? "", /^[a-z0-9]+(?:-[a-z0-9]+){2,4}$/u);
	});

	it("renames the current session when the model is explicitly asked", async () => {
		const { tools, sessionNames } = createHarness();

		const result = await tools.get("rename_session").execute(
			"call",
			{ name: "deferred-session-naming" },
			undefined,
			undefined,
			{},
		);

		assert.deepEqual(sessionNames, ["deferred-session-naming"]);
		assert.equal(result.content[0].text, "Session renamed to: deferred-session-naming");
		assert.deepEqual(result.details, { name: "deferred-session-naming" });
		for (const invalidName of ["Deferred Session Naming", "   "]) {
			await assert.rejects(
				tools.get("rename_session").execute("call", { name: invalidName }, undefined, undefined, {}),
				/Session name must use lowercase kebab-case/,
			);
		}
		assert.deepEqual(sessionNames, ["deferred-session-naming"]);
	});

	it("canonicalizes names set through Pi's native rename paths", async () => {
		const { handlers, sessionNames } = createHarness();
		sessionNames.push("Native Session Name");

		for (const handler of handlers.get("session_info_changed") ?? []) {
			await handler({ name: "Native Session Name" }, {});
		}

		assert.equal(sessionNames.at(-1), "native-session-name");

		sessionNames.push("🔥");
		for (const handler of handlers.get("session_info_changed") ?? []) {
			await handler({ name: "🔥" }, {});
		}
		assert.equal(sessionNames.at(-1), "unnamed-session");

		const restored = createHarness();
		restored.sessionNames.push("Inherited Session Name");
		for (const handler of restored.handlers.get("session_start") ?? []) {
			await handler({ reason: "resume" }, { sessionManager: {} });
		}
		assert.equal(restored.sessionNames.at(-1), "inherited-session-name");
	});

	it("registers without network access and keeps pithos_info read-only", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => { throw new Error("unexpected startup network request"); };
		try {
			const { commands, tools } = createHarness();
			assert.deepEqual([...commands.keys()], ["commit", "pithos"]);
			assert.deepEqual([...tools.keys()], ["create_commit", "rename_session", "pithos_info"]);
			const schemaText = JSON.stringify(tools.get("pithos_info").parameters);
			assert.doesNotMatch(schemaText, /write|apply|manage|update/i);
			const result = await tools.get("pithos_info").execute("call", { action: "catalog" }, undefined, undefined, {
				cwd: "/project",
			} as never);
			assert.equal(result.details.packages.length, 10);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("starts the confirmed commit workflow without committing directly", async () => {
		const { commands, messages } = createHarness();
		const notifications: string[] = [];

		await commands.get("commit").handler("Guild dashboard changes", {
			isIdle: () => true,
			hasUI: true,
			sessionManager: { getBranch: () => [] },
			ui: { notify: (message: string) => notifications.push(message) },
		} as never);

		assert.equal(notifications.length, 0);
		assert.equal(messages.length, 1);
		assert.equal(messages[0]?.message.customType, "atlas-commit-workflow");
		assert.equal(messages[0]?.message.display, false);
		assert.match(messages[0]?.message.content ?? "", /Guild dashboard changes/);
		assert.match(messages[0]?.message.content ?? "", /create_commit/);
		assert.deepEqual(messages[0]?.options, { triggerTurn: true });
	});

	it("shows /commit help without starting an agent turn", async () => {
		const { commands, messages } = createHarness();
		const notifications: string[] = [];

		await commands.get("commit").handler("--help", {
			isIdle: () => true,
			hasUI: true,
			sessionManager: { getBranch: () => [] },
			ui: { notify: (message: string) => notifications.push(message) },
		} as never);

		assert.equal(messages.length, 0);
		assert.equal(notifications.length, 1);
		assert.match(notifications[0] ?? "", /Usage: \/commit \[instructions\]/);
		assert.match(notifications[0] ?? "", /interactive confirmation/i);
	});

	it("refuses to start /commit while Plan mode is active", async () => {
		const { commands, messages } = createHarness();
		const notifications: string[] = [];

		await commands.get("commit").handler("", {
			isIdle: () => true,
			hasUI: true,
			sessionManager: {
				getBranch: () => [{ type: "custom", customType: "plan-theme-state", data: { active: true } }],
			},
			ui: { notify: (message: string) => notifications.push(message) },
		} as never);

		assert.equal(messages.length, 0);
		assert.equal(notifications.length, 1);
		assert.match(notifications[0] ?? "", /commit.*unavailable.*Plan mode/i);
	});

	it("reports configured toolchains through the read-only config tool", async () => {
		const directory = await mkdtemp(join(tmpdir(), "atlas-toolchains-"));
		await writeFile(join(directory, ".pithos"), "toolchains:\n  go: \"1.24.0\"\npi:\n  version: \"0.84.1\"\n");
		try {
			const { tools } = createHarness();
			const result = await tools.get("pithos_info").execute("call", { action: "config" }, undefined, undefined, {
				cwd: directory,
			} as never);
			assert.match(result.content[0].text, /Configured toolchains:\n  go: 1\.24\.0/);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("offers a focused main menu with About, Doctor, and Configure", async () => {
		const { commands } = createHarness();
		const selections: Array<{ title: string; options: string[] }> = [];
		const notifications: string[] = [];
		await commands.get("pithos").handler("", {
			mode: "tui",
			hasUI: true,
			ui: {
				async select(title: string, options: string[]) {
					selections.push({ title, options });
					return "About";
				},
				notify: (message: string) => notifications.push(message),
			},
		} as never);

		assert.deepEqual(selections, [{ title: "Pithos Atlas", options: ["About", "Doctor", "Configure"] }]);
		assert.match(notifications[0] ?? "", /Usage: \/pithos/);
	});

	it("refuses configuration outside a trusted TUI before reading or fetching", async () => {
		const { commands } = createHarness();
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (message?: unknown) => logs.push(String(message));
		try {
			await commands.get("pithos").handler("config", {
				mode: "print",
				hasUI: false,
				cwd: "/does-not-exist",
				isProjectTrusted: () => false,
				ui: { notify() {} },
			} as never);
		} finally {
			console.log = originalLog;
		}
		assert.deepEqual(logs, ["/pithos config requires a trusted interactive TUI."]);
	});

	it("refuses configuration while Plan mode is active", async () => {
		const { commands } = createHarness();
		const notifications: string[] = [];
		let waited = 0;
		await commands.get("pithos").handler("config", {
			mode: "tui",
			hasUI: true,
			cwd: "/does-not-exist",
			isProjectTrusted: () => true,
			waitForIdle: async () => { waited += 1; },
			sessionManager: {
				getBranch: () => [{ type: "custom", customType: "plan-theme-state", data: { active: true } }],
			},
			ui: { notify: (message: string) => notifications.push(message) },
		} as never);
		assert.equal(waited, 1);
		assert.deepEqual(notifications, ["/pithos config is unavailable while Plan mode is active or indeterminate."]);
	});

	it("applies an explicitly confirmed interactive package selection", async () => {
		const directory = await mkdtemp(join(tmpdir(), "atlas-extension-"));
		const path = join(directory, ".pithos");
		await writeFile(path, "toolchains: {}\npi:\n  version: \"0.83.0\"\n");
		const previousOffline = process.env.PI_OFFLINE;
		process.env.PI_OFFLINE = "1";
		try {
			const { commands } = createHarness();
			let packageMenuCount = 0;
			await commands.get("pithos").handler("config", {
				mode: "tui",
				hasUI: true,
				cwd: directory,
				isProjectTrusted: () => true,
				waitForIdle: async () => {},
				sessionManager: { getBranch: () => [] },
				ui: {
					notify() {},
					async select(title: string, options: string[]) {
						if (title === "Configure 1/3 · Pi version") return options[0];
						if (title === "Configure 2/3 · Toolchains") return "Continue";
						if (title === "Configure 3/3 · pithos-kit packages") {
							packageMenuCount += 1;
							return packageMenuCount === 1 ? options.find((option) => option.startsWith("◇ Atlas")) : "Review and Submit";
						}
						if (title === "Atlas version") return "0.1.0";
						if (title.startsWith("Review .pithos changes")) return "Yes";
						return undefined;
					},
					async input() { return undefined; },
				},
			} as never);
			assert.match(await readFile(path, "utf8"), /"@pithos-kit\/atlas": npm:0\.1\.0/);
		} finally {
			if (previousOffline === undefined) delete process.env.PI_OFFLINE;
			else process.env.PI_OFFLINE = previousOffline;
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("lists package-owned commands, tools, prompts, skills, themes, agents, and configuration", async () => {
		const { commands } = createHarness();
		const notifications: string[] = [];
		await commands.get("pithos").handler("packages", {
			mode: "tui",
			hasUI: true,
			ui: { notify: (message: string) => notifications.push(message) },
		} as never);

		assert.equal(notifications.length, 1);
		assert.match(notifications[0] ?? "", /commands: \/commit, \/pithos, \/skill:conventional-commit/);
		assert.match(notifications[0] ?? "", /tools: create_commit \(internal\), rename_session, pithos_info/);
		assert.match(notifications[0] ?? "", /prompts: plan, srs-generator/);
		assert.match(notifications[0] ?? "", /skills: conventional-commit/);
		assert.match(notifications[0] ?? "", /skills: tdd/);
		assert.match(notifications[0] ?? "", /themes: plan/);
		assert.match(notifications[0] ?? "", /agents: dotnet-architect/);
		assert.match(notifications[0] ?? "", /configuration: file \.pi\/aegis\.json/);
	});

	it("shows the single Atlas help page", async () => {
		const { commands } = createHarness();
		const notifications: string[] = [];
		await commands.get("pithos").handler("help", {
			mode: "tui",
			hasUI: true,
			ui: { notify: (message: string) => notifications.push(message) },
		} as never);
		assert.equal(notifications.length, 1);
		assert.match(notifications[0], /3–5-word session names/);
		assert.match(notifications[0], /Usage: \/pithos/);
		assert.doesNotMatch(notifications[0], /\/pithos help </);
	});
});
