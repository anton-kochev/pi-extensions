import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	completeSyntheticSessionName,
	generateSessionName,
	registerSessionNaming,
	selectSessionNameModel,
	validateGeneratedSessionName,
} from "../src/session-name.ts";

async function flushAsyncWork(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

function createPendingNamingHarness() {
	let currentName: string | undefined;
	const assigned: string[] = [];
	const handlers = new Map<string, (event: any, ctx: any) => void>();
	const cheap = model("provider", "cheap");
	let completionSignal: AbortSignal | undefined;
	let authCalls = 0;
	let completionCalls = 0;
	let resolveCompletion: (result: { text: string; stopReason: string }) => void = () => {};
	let rejectCompletion: (error: Error) => void = () => {};
	const completion = new Promise<{ text: string; stopReason: string }>((resolve, reject) => {
		resolveCompletion = resolve;
		rejectCompletion = reject;
	});
	const pi = {
		on(name: string, handler: (event: any, ctx: any) => void) {
			handlers.set(name, handler);
		},
		getSessionName: () => currentName,
		setSessionName(name: string) {
			currentName = name;
			assigned.push(name);
		},
	};
	registerSessionNaming(pi as never, {
		generateFallback: () => "neon-grunge-reboot",
		pathExists: () => false,
		isOffline: () => false,
		complete: async (_model, _auth, signal) => {
			completionCalls += 1;
			completionSignal = signal;
			return completion;
		},
		scheduleTimeout: () => () => {},
	});
	const ctx = {
		sessionManager: { getSessionFile: () => "/sessions/fresh.jsonl" },
		modelRegistry: {
			getAvailable: () => [cheap],
			getApiKeyAndHeaders: async () => {
				authCalls += 1;
				return { ok: true, apiKey: "secret" };
			},
		},
		scopedModels: [],
	};
	let started = false;
	const start = () => {
		if (!started) {
			started = true;
			handlers.get("session_start")?.({ reason: "startup" }, ctx);
		}
		handlers.get("message_start")?.({ message: { role: "user" } }, ctx);
	};
	return {
		assigned,
		handlers,
		start,
		resolveCompletion,
		rejectCompletion,
		getCompletionSignal: () => completionSignal,
		getAuthCalls: () => authCalls,
		getCompletionCalls: () => completionCalls,
		getName: () => currentName,
	};
}

function createNamingHarness(initialName?: string, pathExists: (path: string) => boolean = () => false) {
	let currentName = initialName;
	const handlers = new Map<string, (event: any, ctx: any) => void>();
	const assigned: string[] = [];
	const pi = {
		on(name: string, handler: (event: any, ctx: any) => void) {
			handlers.set(name, handler);
		},
		getSessionName: () => currentName,
		setSessionName(name: string) {
			currentName = name;
			assigned.push(name);
		},
	};
	registerSessionNaming(pi as never, {
		generateFallback: () => "neon-grunge-reboot",
		pathExists,
		isOffline: () => true,
	});
	return {
		handlers,
		assigned,
		getName: () => currentName,
		sendUserMessage: (ctx: any = {}) => handlers.get("message_start")?.({ message: { role: "user" } }, ctx),
	};
}

describe("generateSessionName", () => {
	it("combines one evocative word from each decade into a readable name", () => {
		const picks = [0, 0, 0];
		const name = generateSessionName(() => picks.shift() ?? 0);

		assert.equal(name, "neon-grunge-reboot");
	});

	it("provides a broad combination space without losing the three-word format", () => {
		const bankSizes: number[] = [];
		const name = generateSessionName((size) => {
			bankSizes.push(size);
			return size - 1;
		});

		assert.deepEqual(bankSizes, [20, 20, 20]);
		assert.equal(name, "rollerskate-slacker-screensaver");
		assert.match(name, /^[a-z]+(?:-[a-z]+){2}$/u);
	});
});

describe("validateGeneratedSessionName", () => {
	it("accepts trimmed lowercase kebab names containing three to five words", () => {
		for (const name of [
			"neon-grunge-reboot",
			"neon-y2k-reboot",
			"neon-pager-ringtone-reboot",
			"neon-arcade-pager-ringtone-reboot",
		]) {
			assert.equal(validateGeneratedSessionName(`\n${name}\n`), name);
		}
	});

	it("rejects prose, decoration, malformed word counts, and oversized output", () => {
		for (const value of [
			"",
			"neon-reboot",
			"neon-arcade-grunge-pager-ringtone-reboot",
			"Neon-Grunge-Reboot",
			"neon_grunge_reboot",
			"`neon-grunge-reboot`",
			"Here is neon-grunge-reboot",
			`${"a".repeat(61)}-b-c`,
		]) {
			assert.equal(validateGeneratedSessionName(value), undefined, value);
		}
	});
});

function model(
	provider: string,
	id: string,
	options: {
		reasoning?: boolean;
		input?: string[];
		inputCost?: number;
		outputCost?: number;
		tiers?: Array<{ inputTokensAbove: number; input: number; output: number }>;
	} = {},
) {
	return {
		provider,
		id,
		reasoning: options.reasoning ?? false,
		input: options.input ?? ["text"],
		maxTokens: 128,
		cost: {
			input: options.inputCost ?? 1,
			output: options.outputCost ?? 1,
			cacheRead: 0,
			cacheWrite: 0,
			tiers: options.tiers,
		},
	};
}

describe("selectSessionNameModel", () => {
	it("selects the cheapest available non-reasoning text model", () => {
		const expensive = model("provider", "expensive", { inputCost: 2, outputCost: 4 });
		const cheap = model("provider", "cheap", { inputCost: 0.1, outputCost: 0.2 });
		const reasoning = model("provider", "reasoning", { reasoning: true, inputCost: 0 });
		const imageOnly = model("provider", "image", { input: ["image"], inputCost: 0 });

		assert.equal(
			selectSessionNameModel([expensive, reasoning, imageOnly, cheap] as never, []),
			cheap,
		);
	});

	it("uses the applicable short-request pricing tier", () => {
		const tiered = model("provider", "tiered", {
			inputCost: 0,
			outputCost: 0,
			tiers: [{ inputTokensAbove: 100, input: 10, output: 10 }],
		});
		const steady = model("provider", "steady", { inputCost: 1, outputCost: 1 });

		assert.equal(selectSessionNameModel([tiered, steady] as never, []), steady);
	});

	it("respects the models scoped to the current session", () => {
		const scoped = model("provider", "scoped", { inputCost: 2, outputCost: 4 });
		const cheaperOutsideScope = model("provider", "outside", { inputCost: 0, outputCost: 0 });

		assert.equal(
			selectSessionNameModel(
				[cheaperOutsideScope, scoped] as never,
				[{ model: scoped }] as never,
			),
			scoped,
		);
	});
});

describe("completeSyntheticSessionName", () => {
	it("sends only static naming instructions with a bounded no-cache request", async () => {
		let capturedContext: any;
		let capturedOptions: any;
		const controller = new AbortController();
		const result = await completeSyntheticSessionName(
			model("provider", "cheap") as never,
			{ apiKey: "secret", headers: { "x-test": "value" }, env: { REGION: "test" } },
			controller.signal,
			async (_model: any, context: any, options: any) => {
				capturedContext = context;
				capturedOptions = options;
				return {
					stopReason: "stop",
					content: [
						{ type: "thinking", thinking: "ignored" },
						{ type: "text", text: "neon-pager-ringtone-reboot" },
					],
				};
			},
		);

		assert.deepEqual(result, { text: "neon-pager-ringtone-reboot", stopReason: "stop" });
		assert.match(capturedContext.systemPrompt, /synthetic session names/i);
		assert.equal(capturedContext.messages.length, 1);
		assert.match(capturedContext.messages[0].content[0].text, /3 to 5 lowercase ASCII words/);
		assert.equal(JSON.stringify(capturedContext).includes("sessionId"), false);
		assert.deepEqual(capturedOptions, {
			apiKey: "secret",
			headers: { "x-test": "value" },
			env: { REGION: "test" },
			maxTokens: 32,
			temperature: 1,
			signal: controller.signal,
			cacheRetention: "none",
			maxRetries: 0,
			timeoutMs: 10000,
		});
	});
});

describe("registerSessionNaming", () => {
	it("starts at most one generation attempt for a session", async () => {
		const harness = createPendingNamingHarness();

		harness.start();
		harness.start();
		await flushAsyncWork();

		assert.equal(harness.getAuthCalls(), 1);
		assert.equal(harness.getCompletionCalls(), 1);
		harness.resolveCompletion({ text: "neon-pager-ringtone-reboot", stopReason: "stop" });
		await flushAsyncWork();
		assert.deepEqual(harness.assigned, ["neon-pager-ringtone-reboot"]);
	});

	it("uses a valid synthetic name from the cheapest model without blocking the first message", async () => {
		let currentName: string | undefined;
		const assigned: string[] = [];
		const handlers = new Map<string, (event: any, ctx: any) => void>();
		const cheap = model("provider", "cheap", { inputCost: 0.1, outputCost: 0.1 });
		const pi = {
			on(name: string, handler: (event: any, ctx: any) => void) {
				handlers.set(name, handler);
			},
			getSessionName: () => currentName,
			setSessionName(name: string) {
				currentName = name;
				assigned.push(name);
			},
		};
		registerSessionNaming(pi as never, {
			generateFallback: () => "neon-grunge-reboot",
			pathExists: () => false,
			isOffline: () => false,
			complete: async () => ({ text: "neon-pager-ringtone-reboot", stopReason: "stop" }),
			scheduleTimeout: () => () => {},
		} as never);
		const ctx = {
			sessionManager: { getSessionFile: () => "/sessions/fresh.jsonl" },
			modelRegistry: {
				getAvailable: () => [cheap],
				getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "secret" }),
			},
			scopedModels: [],
		};

		const startResult = handlers.get("session_start")?.({ reason: "startup" }, ctx);
		assert.equal(startResult, undefined);
		assert.deepEqual(assigned, []);

		const messageResult = handlers.get("message_start")?.({ message: { role: "user" } }, ctx);
		assert.equal(messageResult, undefined);
		assert.deepEqual(assigned, []);

		await flushAsyncWork();
		assert.deepEqual(assigned, ["neon-pager-ringtone-reboot"]);
	});

	it("takes the default model path before falling back on an auth failure", async () => {
		let currentName: string | undefined;
		const assigned: string[] = [];
		const handlers = new Map<string, (event: any, ctx: any) => void>();
		const cheap = model("provider", "cheap");
		let resolveAuth: (value: { ok: false; error: string }) => void = () => {};
		const auth = new Promise<{ ok: false; error: string }>((resolve) => {
			resolveAuth = resolve;
		});
		const pi = {
			on(name: string, handler: (event: any, ctx: any) => void) {
				handlers.set(name, handler);
			},
			getSessionName: () => currentName,
			setSessionName(name: string) {
				currentName = name;
				assigned.push(name);
			},
		};
		registerSessionNaming(pi as never, {
			generateFallback: () => "neon-grunge-reboot",
			pathExists: () => false,
			isOffline: () => false,
			scheduleTimeout: () => () => {},
		});

		const ctx = {
			sessionManager: { getSessionFile: () => "/sessions/fresh.jsonl" },
			modelRegistry: {
				getAvailable: () => [cheap],
				getApiKeyAndHeaders: () => auth,
			},
			scopedModels: [],
		};
		handlers.get("session_start")?.({ reason: "startup" }, ctx);
		assert.deepEqual(assigned, []);
		handlers.get("message_start")?.({ message: { role: "user" } }, ctx);
		assert.deepEqual(assigned, []);

		resolveAuth({ ok: false, error: "missing credentials" });
		await flushAsyncWork();
		assert.deepEqual(assigned, ["neon-grunge-reboot"]);
	});

	it("uses the local fallback when model output is invalid", async () => {
		const harness = createPendingNamingHarness();
		harness.start();
		await flushAsyncWork();

		harness.resolveCompletion({ text: "Here is Neon Grunge Reboot", stopReason: "stop" });
		await flushAsyncWork();

		assert.deepEqual(harness.assigned, ["neon-grunge-reboot"]);
	});

	it("uses the local fallback when the model request fails", async () => {
		const harness = createPendingNamingHarness();
		harness.start();
		await flushAsyncWork();

		harness.rejectCompletion(new Error("provider unavailable"));
		await flushAsyncWork();

		assert.deepEqual(harness.assigned, ["neon-grunge-reboot"]);
	});

	it("falls back on timeout and ignores a late model response", async () => {
		let currentName: string | undefined;
		const assigned: string[] = [];
		const handlers = new Map<string, (event: any, ctx: any) => void>();
		const cheap = model("provider", "cheap");
		let timeout: (() => void) | undefined;
		let completionSignal: AbortSignal | undefined;
		let resolveCompletion: (result: { text: string; stopReason: string }) => void = () => {};
		const completion = new Promise<{ text: string; stopReason: string }>((resolve) => {
			resolveCompletion = resolve;
		});
		const pi = {
			on(name: string, handler: (event: any, ctx: any) => void) {
				handlers.set(name, handler);
			},
			getSessionName: () => currentName,
			setSessionName(name: string) {
				currentName = name;
				assigned.push(name);
			},
		};
		registerSessionNaming(pi as never, {
			generateFallback: () => "neon-grunge-reboot",
			pathExists: () => false,
			isOffline: () => false,
			complete: async (_model, _auth, signal) => {
				completionSignal = signal;
				return completion;
			},
			scheduleTimeout: (callback, timeoutMs) => {
				assert.equal(timeoutMs, 10000);
				timeout = callback;
				return () => {};
			},
		});
		const ctx = {
			sessionManager: { getSessionFile: () => "/sessions/fresh.jsonl" },
			modelRegistry: {
				getAvailable: () => [cheap],
				getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "secret" }),
			},
			scopedModels: [],
		};
		handlers.get("session_start")?.({ reason: "startup" }, ctx);
		handlers.get("message_start")?.({ message: { role: "user" } }, ctx);
		await flushAsyncWork();

		assert.ok(timeout);
		timeout();
		assert.equal(completionSignal?.aborted, true);
		assert.deepEqual(assigned, ["neon-grunge-reboot"]);

		resolveCompletion({ text: "neon-pager-ringtone-reboot", stopReason: "stop" });
		await flushAsyncWork();
		assert.deepEqual(assigned, ["neon-grunge-reboot"]);
	});

	it("aborts pending generation when the session is named externally", async () => {
		let currentName: string | undefined;
		const assigned: string[] = [];
		const handlers = new Map<string, (event: any, ctx: any) => void>();
		const cheap = model("provider", "cheap");
		let completionSignal: AbortSignal | undefined;
		let resolveCompletion: (result: { text: string; stopReason: string }) => void = () => {};
		const completion = new Promise<{ text: string; stopReason: string }>((resolve) => {
			resolveCompletion = resolve;
		});
		const pi = {
			on(name: string, handler: (event: any, ctx: any) => void) {
				handlers.set(name, handler);
			},
			getSessionName: () => currentName,
			setSessionName(name: string) {
				currentName = name;
				assigned.push(name);
			},
		};
		registerSessionNaming(pi as never, {
			pathExists: () => false,
			isOffline: () => false,
			complete: async (_model, _auth, signal) => {
				completionSignal = signal;
				return completion;
			},
			scheduleTimeout: () => () => {},
		});
		const ctx = {
			sessionManager: { getSessionFile: () => "/sessions/fresh.jsonl" },
			modelRegistry: {
				getAvailable: () => [cheap],
				getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "secret" }),
			},
			scopedModels: [],
		};
		handlers.get("session_start")?.({ reason: "startup" }, ctx);
		handlers.get("message_start")?.({ message: { role: "user" } }, ctx);
		await flushAsyncWork();

		currentName = "manual-session-name";
		handlers.get("session_info_changed")?.({ name: currentName }, {});
		assert.equal(completionSignal?.aborted, true);

		resolveCompletion({ text: "neon-pager-ringtone-reboot", stopReason: "stop" });
		await flushAsyncWork();
		assert.deepEqual(assigned, []);
		assert.equal(currentName, "manual-session-name");
	});

	it("does not start a model request after an external name wins during auth", async () => {
		let currentName: string | undefined;
		const handlers = new Map<string, (event: any, ctx: any) => void>();
		const cheap = model("provider", "cheap");
		let completeCalls = 0;
		let resolveAuth: (value: { ok: true; apiKey: string }) => void = () => {};
		const auth = new Promise<{ ok: true; apiKey: string }>((resolve) => {
			resolveAuth = resolve;
		});
		const pi = {
			on(name: string, handler: (event: any, ctx: any) => void) {
				handlers.set(name, handler);
			},
			getSessionName: () => currentName,
			setSessionName(name: string) {
				currentName = name;
			},
		};
		registerSessionNaming(pi as never, {
			pathExists: () => false,
			isOffline: () => false,
			complete: async () => {
				completeCalls += 1;
				return { text: "neon-pager-ringtone-reboot", stopReason: "stop" };
			},
			scheduleTimeout: () => () => {},
		});
		const ctx = {
			sessionManager: { getSessionFile: () => "/sessions/fresh.jsonl" },
			modelRegistry: {
				getAvailable: () => [cheap],
				getApiKeyAndHeaders: () => auth,
			},
			scopedModels: [],
		};
		handlers.get("session_start")?.({ reason: "startup" }, ctx);
		handlers.get("message_start")?.({ message: { role: "user" } }, ctx);

		currentName = "manual-session-name";
		handlers.get("session_info_changed")?.({ name: currentName }, {});
		resolveAuth({ ok: true, apiKey: "secret" });
		await flushAsyncWork();

		assert.equal(completeCalls, 0);
		assert.equal(currentName, "manual-session-name");
	});

	it("keeps generation pending while the first main agent turn starts", async () => {
		const harness = createPendingNamingHarness();
		harness.start();
		await flushAsyncWork();

		harness.handlers.get("agent_start")?.({}, {});

		assert.equal(harness.getCompletionSignal()?.aborted, false);
		assert.deepEqual(harness.assigned, []);
		harness.resolveCompletion({ text: "neon-pager-ringtone-reboot", stopReason: "stop" });
		await flushAsyncWork();
		assert.deepEqual(harness.assigned, ["neon-pager-ringtone-reboot"]);
	});

	it("settles with the fallback before session shutdown", async () => {
		const harness = createPendingNamingHarness();
		harness.start();
		await flushAsyncWork();

		harness.handlers.get("session_shutdown")?.({ reason: "new" }, {});

		assert.equal(harness.getCompletionSignal()?.aborted, true);
		assert.deepEqual(harness.assigned, ["neon-grunge-reboot"]);
	});

	it("does not name an empty session when it shuts down", () => {
		const harness = createNamingHarness();
		harness.handlers.get("session_start")?.(
			{ reason: "startup" },
			{ sessionManager: { getSessionFile: () => "/sessions/fresh.jsonl" } },
		);

		harness.handlers.get("session_shutdown")?.({ reason: "quit" }, {});

		assert.deepEqual(harness.assigned, []);
	});

	it("uses the local fallback only after the first user message in an offline fresh session", () => {
		const harness = createNamingHarness();
		const event = { reason: "startup" };
		const ctx = {
			sessionManager: {
				getEntries: () => [
					{ type: "model_change" },
					{ type: "thinking_level_change" },
				],
				getSessionFile: () => "/sessions/fresh.jsonl",
			},
		};
		const handler = harness.handlers.get("session_start");

		handler?.(event, ctx);
		handler?.(event, ctx);
		harness.handlers.get("message_start")?.({ message: { role: "assistant" } }, ctx);
		assert.deepEqual(harness.assigned, []);

		harness.sendUserMessage(ctx);
		harness.sendUserMessage(ctx);

		assert.deepEqual(harness.assigned, ["neon-grunge-reboot"]);
		assert.equal(harness.getName(), "neon-grunge-reboot");
	});

	it("waits for the first user message in offline sessions created by /new or fork", () => {
		const cases = [
			{ reason: "new", entries: [] },
			{ reason: "fork", entries: [{ type: "message" }] },
		];
		for (const { reason, entries } of cases) {
			const harness = createNamingHarness();
			const ctx = { sessionManager: { getEntries: () => entries } };

			harness.handlers.get("session_start")?.({ reason }, ctx);
			assert.deepEqual(harness.assigned, [], reason);

			harness.sendUserMessage(ctx);
			assert.deepEqual(harness.assigned, ["neon-grunge-reboot"], reason);
		}
	});

	it("preserves explicit, manual, and inherited names", () => {
		for (const reason of ["startup", "new", "resume", "fork", "reload"]) {
			const harness = createNamingHarness("Manual Session Name");

			const ctx = { sessionManager: { getEntries: () => [] } };
			harness.handlers.get("session_start")?.({ reason }, ctx);
			harness.sendUserMessage(ctx);

			assert.deepEqual(harness.assigned, [], reason);
			assert.equal(harness.getName(), "Manual Session Name", reason);
		}
	});

	it("leaves resumed persisted sessions and reloads unnamed", () => {
		const cases = [
			{ reason: "startup", entries: [{ type: "thinking_level_change" }] },
			{ reason: "resume", entries: [{ type: "message" }] },
			{ reason: "reload", entries: [] },
		];
		for (const { reason, entries } of cases) {
			const harness = createNamingHarness(undefined, () => true);

			const ctx = {
				sessionManager: {
					getEntries: () => entries,
					getSessionFile: () => "/sessions/existing.jsonl",
				},
			};
			harness.handlers.get("session_start")?.({ reason }, ctx);
			harness.sendUserMessage(ctx);

			assert.deepEqual(harness.assigned, [], reason);
		}
	});
});
