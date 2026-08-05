import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { GuildMember } from "./agents";

export interface RunUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface GuildRunResult {
	member: GuildMember["name"];
	memberSource: GuildMember["source"];
	task: string;
	output: string;
	exitCode: number;
	stderr: string;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	usage: RunUsage;
}

export interface ChildArgumentOptions {
	member: GuildMember;
	task: string;
	systemPromptFile: string;
	model?: string;
	thinkingLevel?: string;
	projectTrusted: boolean;
}

export interface RunGuildMemberOptions {
	member: GuildMember;
	task: string;
	cwd: string;
	model?: string;
	thinkingLevel?: string;
	projectTrusted: boolean;
	signal?: AbortSignal;
	onUpdate?: (result: GuildRunResult) => void;
}

export function buildChildArguments(options: ChildArgumentOptions): string[] {
	const args = [
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--no-extensions",
		"--no-prompt-templates",
		options.projectTrusted ? "--approve" : "--no-approve",
		"--tools",
		options.member.tools.join(","),
	];
	if (options.model) args.push("--model", options.model);
	if (options.thinkingLevel) args.push("--thinking", options.thinkingLevel);
	args.push("--append-system-prompt", options.systemPromptFile, `Task: ${options.task}`);
	return args;
}

export function createEmptyRunResult(member: GuildMember, task: string): GuildRunResult {
	return {
		member: member.name,
		memberSource: member.source,
		task,
		output: "",
		exitCode: 0,
		stderr: "",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0,
			contextTokens: 0,
			turns: 0,
		},
	};
}

function finalizedText(message: any): string {
	if (!Array.isArray(message?.content)) return "";
	return message.content
		.filter((part: any) => part?.type === "text" && typeof part.text === "string")
		.map((part: any) => part.text)
		.join("\n");
}

export function applyJsonEvent(result: GuildRunResult, event: any): void {
	if (event?.type === "message_start" && event.message?.role === "assistant") {
		result.output = "";
		return;
	}

	if (event?.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
		result.output += event.assistantMessageEvent.delta ?? "";
		return;
	}

	if (event?.type === "message_end" && event.message?.role === "assistant") {
		result.usage.turns++;
		result.model = event.message.model ?? result.model;
		result.stopReason = event.message.stopReason ?? result.stopReason;
		result.errorMessage = event.message.errorMessage ?? result.errorMessage;
		const text = finalizedText(event.message);
		if (text) result.output = text;

		const usage = event.message.usage;
		if (usage) {
			result.usage.input += usage.input || 0;
			result.usage.output += usage.output || 0;
			result.usage.cacheRead += usage.cacheRead || 0;
			result.usage.cacheWrite += usage.cacheWrite || 0;
			result.usage.cost += usage.cost?.total || 0;
			result.usage.contextTokens = usage.totalTokens || result.usage.contextTokens;
		}
		return;
	}

	if (event?.type === "error") {
		result.errorMessage = event.error?.message ?? event.message ?? result.errorMessage;
	}
}

export function getRunFailure(result: GuildRunResult): string | null {
	const failedStop = result.stopReason === "error" || result.stopReason === "aborted";
	if (result.exitCode === 0 && !failedStop) return null;
	return (
		result.errorMessage?.trim() ||
		result.stderr.trim().split("\n").slice(-6).join("\n") ||
		result.output.trim() ||
		`Guild member process exited with code ${result.exitCode}`
	);
}

export function truncateUtf8(value: string, maxBytes: number): string {
	const totalBytes = Buffer.byteLength(value, "utf8");
	if (totalBytes <= maxBytes) return value;

	let kept = "";
	let keptBytes = 0;
	for (const character of value) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (keptBytes + characterBytes > maxBytes) break;
		kept += character;
		keptBytes += characterBytes;
	}
	return `${kept}\n\n[Output truncated: ${totalBytes - keptBytes} bytes omitted.]`;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const executableName = path.basename(process.execPath).toLowerCase();
	if (!/^(node|bun)(\.exe)?$/.test(executableName)) return { command: process.execPath, args };
	return { command: "pi", args };
}

function delegatedSystemPrompt(member: GuildMember): string {
	return [
		`# Standalone Guild member: ${member.name}`,
		"",
		`Definition source: ${member.source}.`,
		"Work only on the delegated task. You have an isolated context and cannot ask another member to finish your role.",
		"Treat the tool allowlist as a hard capability boundary.",
		"",
		member.systemPrompt,
	].join("\n");
}

async function writeSystemPrompt(member: GuildMember): Promise<{ directory: string; filePath: string }> {
	const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-guild-"));
	const filePath = path.join(directory, `${member.name}.md`);
	await fs.promises.writeFile(filePath, delegatedSystemPrompt(member), { encoding: "utf8", mode: 0o600 });
	return { directory, filePath };
}

export async function runGuildMember(options: RunGuildMemberOptions): Promise<GuildRunResult> {
	const result = createEmptyRunResult(options.member, options.task);
	result.model = options.model;
	const prompt = await writeSystemPrompt(options.member);
	const args = buildChildArguments({
		member: options.member,
		task: options.task,
		systemPromptFile: prompt.filePath,
		model: options.model,
		thinkingLevel: options.thinkingLevel,
		projectTrusted: options.projectTrusted,
	});
	const invocation = getPiInvocation(args);
	let wasAborted = false;

	try {
		result.exitCode = await new Promise<number>((resolve) => {
			const child = spawn(invocation.command, invocation.args, {
				cwd: options.cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
			});
			let buffer = "";
			let closed = false;
			let killTimer: NodeJS.Timeout | undefined;
			let lastUpdate = 0;

			const emitUpdate = (force = false) => {
				const now = Date.now();
				if (!force && now - lastUpdate < 100) return;
				lastUpdate = now;
				options.onUpdate?.({ ...result, usage: { ...result.usage } });
			};

			const processLine = (line: string) => {
				if (!line.trim()) return;
				try {
					applyJsonEvent(result, JSON.parse(line));
					emitUpdate();
				} catch {
					// Ignore non-JSON stdout; JSON mode should emit one object per line.
				}
			};

			const abort = () => {
				if (closed) return;
				wasAborted = true;
				child.kill("SIGTERM");
				killTimer = setTimeout(() => {
					if (!closed) child.kill("SIGKILL");
				}, 3000);
				killTimer.unref?.();
			};

			child.stdout.on("data", (chunk) => {
				buffer += chunk.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) processLine(line);
			});
			child.stderr.on("data", (chunk) => {
				result.stderr += chunk.toString();
			});
			child.on("error", (error) => {
				result.stderr += error instanceof Error ? error.message : String(error);
			});
			child.on("close", (code) => {
				closed = true;
				if (killTimer) clearTimeout(killTimer);
				options.signal?.removeEventListener("abort", abort);
				if (buffer.trim()) processLine(buffer);
				emitUpdate(true);
				resolve(code ?? 1);
			});

			if (options.signal?.aborted) abort();
			else options.signal?.addEventListener("abort", abort, { once: true });
		});
	} finally {
		await fs.promises.rm(prompt.directory, { recursive: true, force: true }).catch(() => undefined);
	}

	if (wasAborted) throw new Error(`${options.member.name} was aborted`);
	return result;
}
