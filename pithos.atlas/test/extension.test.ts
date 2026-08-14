import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import atlas from "../extensions/index.ts";

function createHarness() {
	const commands = new Map<string, any>();
	const tools = new Map<string, any>();
	atlas({
		registerCommand(name: string, definition: any) { commands.set(name, definition); },
		registerTool(definition: any) { tools.set(definition.name, definition); },
		getCommands() { return []; },
		getAllTools() { return []; },
	} as never);
	return { commands, tools };
}

describe("Atlas extension", () => {
	it("registers without network access and keeps pithos_info read-only", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => { throw new Error("unexpected startup network request"); };
		try {
			const { commands, tools } = createHarness();
			assert.deepEqual([...commands.keys()], ["pithos"]);
			assert.deepEqual([...tools.keys()], ["pithos_info"]);
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
		assert.match(notifications[0] ?? "", /prompts: plan, commit, srs-generator/);
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
		assert.match(notifications[0], /Usage: \/pithos/);
		assert.doesNotMatch(notifications[0], /\/pithos help </);
	});
});
