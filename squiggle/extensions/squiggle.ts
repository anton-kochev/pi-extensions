import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { complete, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function squiggle(pi: ExtensionAPI) {
	pi.registerCommand("squiggle-status", {
		description: "Show whether squiggle is loaded",
		handler: async (_args, ctx) => {
			const config = loadConfig(ctx.cwd);
			const model = selectCorrectionModel(ctx, config);
			ctx.ui.notify(`squiggle is loaded (${config.mode}, ${formatModel(model)}).`, "info");
		},
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };

		const config = loadConfig(ctx.cwd);
		if (config.mode === "off") return { action: "continue" };
		if (!event.text.trim()) return { action: "continue" };

		const corrected = await correctWithModel(event.text, ctx, config);
		if (!corrected || corrected === event.text) return { action: "continue" };

		if (ctx.hasUI) ctx.ui.notify(formatColoredDiff(event.text, corrected), "info");

		// In interactive mode, `transform` changes what the agent receives, but the
		// already-submitted prompt may still be rendered as originally typed. To make
		// the visible user message corrected too, swallow the original input and
		// resubmit the corrected text as an extension-originated user message. The
		// source guard above prevents a correction loop.
		if (event.source === "interactive") {
			pi.sendUserMessage(corrected);
			return { action: "handled" };
		}

		return { action: "transform", text: corrected };
	});
}

const CORRECTION_PROMPT = `You are a conservative grammar and spelling corrector for user prompts sent to a coding assistant.

Task:
- Correct spelling, grammar, capitalization, and punctuation.
- Preserve the user's meaning, tone, language, and intent.
- Do not answer the prompt.
- Do not add explanations, quotes, prefixes, markdown fences, or alternatives.
- If the input is already acceptable, return it unchanged.
- Return only the corrected prompt text.`;

const DEFAULT_CORRECTION_MODEL = "openai-codex/gpt-5.4-mini";
const DEFAULT_MAX_LLM_INPUT_CHARS = 500;

type SquiggleConfig = {
	mode: "on" | "off";
	model: string;
	maxInputChars: number;
};

async function correctWithModel(input: string, ctx: ExtensionContext, config: SquiggleConfig): Promise<string | null> {
	const model = selectCorrectionModel(ctx, config);
	if (!model) return null;
	if (input.length > config.maxInputChars) return null;

	try {
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok || !auth.apiKey) return null;

		const userMessage: UserMessage = {
			role: "user",
			content: [{ type: "text", text: input }],
			timestamp: Date.now(),
		};

		const response = await complete(
			model,
			{ systemPrompt: CORRECTION_PROMPT, messages: [userMessage] },
			{ apiKey: auth.apiKey, headers: auth.headers },
		);

		if (response.stopReason === "aborted") return null;

		return response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n")
			.trim();
	} catch {
		return null;
	}
}

function loadConfig(cwd: string): SquiggleConfig {
	const fileConfig = readConfigFile(cwd);
	return {
		mode: normalizeMode(process.env.SQUIGGLE_MODE ?? fileConfig.mode) ?? "on",
		model: process.env.SQUIGGLE_MODEL ?? fileConfig.model ?? DEFAULT_CORRECTION_MODEL,
		maxInputChars: normalizePositiveInt(process.env.SQUIGGLE_MAX_CHARS ?? fileConfig.maxInputChars) ?? DEFAULT_MAX_LLM_INPUT_CHARS,
	};
}

function readConfigFile(cwd: string): Partial<SquiggleConfig> {
	const path = join(cwd, ".pi", "squiggle.json");
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		return {
			mode: typeof parsed.mode === "string" ? normalizeMode(parsed.mode) : undefined,
			model: typeof parsed.model === "string" ? parsed.model : undefined,
			maxInputChars: normalizePositiveInt(parsed.maxInputChars),
		};
	} catch {
		return {};
	}
}

function normalizeMode(value: unknown): SquiggleConfig["mode"] | undefined {
	return value === "on" || value === "off" ? value : undefined;
}

function normalizePositiveInt(value: unknown): number | undefined {
	const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function selectCorrectionModel(ctx: ExtensionContext, config: SquiggleConfig) {
	const configured = parseModelSpec(config.model);
	if (configured) {
		const model = ctx.modelRegistry.find(configured.provider, configured.model);
		if (model) return model;
	}
	return ctx.model;
}

function parseModelSpec(spec: string): { provider: string; model: string } | null {
	const slash = spec.indexOf("/");
	if (slash <= 0 || slash === spec.length - 1) return null;
	return { provider: spec.slice(0, slash), model: spec.slice(slash + 1) };
}

function formatModel(model: ReturnType<typeof selectCorrectionModel>): string {
	return model ? `${model.provider}/${model.id}` : "no model";
}

type DiffOp = {
	type: "same" | "add" | "remove";
	text: string;
};

function formatColoredDiff(before: string, after: string): string {
	const dim = "\x1b[90;3m";
	const same = "\x1b[90;3m";
	const added = "\x1b[32;3m";
	const removed = "\x1b[31;3m";
	const reset = "\x1b[0m";

	const rendered = diffChars(before.trim(), after.trim())
		.map((op) => {
			if (op.type === "add") return `${added}${op.text}${reset}`;
			if (op.type === "remove") return `${removed}${op.text}${reset}`;
			return `${same}${op.text}${reset}`;
		})
		.join("");

	return `${dim}squiggle:${reset}\n${rendered}`;
}

function diffChars(before: string, after: string): DiffOp[] {
	const beforeChars = Array.from(before);
	const afterChars = Array.from(after);
	const rows = beforeChars.length + 1;
	const cols = afterChars.length + 1;
	const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

	for (let i = beforeChars.length - 1; i >= 0; i--) {
		for (let j = afterChars.length - 1; j >= 0; j--) {
			dp[i]![j] = beforeChars[i] === afterChars[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
		}
	}

	const ops: DiffOp[] = [];
	let i = 0;
	let j = 0;
	while (i < beforeChars.length || j < afterChars.length) {
		if (i < beforeChars.length && j < afterChars.length && beforeChars[i] === afterChars[j]) {
			pushDiffOp(ops, "same", afterChars[j]!);
			i++;
			j++;
		} else if (j < afterChars.length && (i === beforeChars.length || dp[i]![j + 1]! > dp[i + 1]![j]!)) {
			pushDiffOp(ops, "add", afterChars[j]!);
			j++;
		} else if (i < beforeChars.length) {
			pushDiffOp(ops, "remove", beforeChars[i]!);
			i++;
		}
	}

	return ops;
}

function pushDiffOp(ops: DiffOp[], type: DiffOp["type"], text: string) {
	const last = ops.at(-1);
	if (last?.type === type) {
		last.text += text;
		return;
	}
	ops.push({ type, text });
}
