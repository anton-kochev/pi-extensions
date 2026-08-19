import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planModeState } from "./safety.ts";

export const CREATE_COMMIT_TOOL_NAME = "create_commit";
export const COMMIT_HELP = `Usage: /commit [instructions]

Prepare a context-scoped Conventional Commit. Staging can be inferred from explicit instructions or active task context; creating the commit always requires interactive confirmation.

Options:
  --help, -h  Show this help`;

const COMMIT_SKILL_PATH = fileURLToPath(new URL("../skills/conventional-commit/SKILL.md", import.meta.url));

const CREATE_COMMIT_PARAMETERS = {
	type: "object",
	properties: {
		message: {
			type: "string",
			minLength: 1,
			maxLength: 4096,
			description: "Complete Conventional Commit message to show for approval and commit",
		},
	},
	required: ["message"],
	additionalProperties: false,
} as const;

const DIRECT_GIT_COMMIT_RE = /(?:^|&&|\|\||[;\n])\s*\(?\s*(?:command\s+)?git(?:\s+(?:(?:-C|-c)\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)|--(?:git-dir|work-tree|namespace)(?:=(?:"[^"]*"|'[^']*'|[^\s;&|]+)|\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+))|--(?:bare|no-pager|paginate)))*\s+commit(?:\s|$)/m;

export function isDirectGitCommitCommand(command: string): boolean {
	return DIRECT_GIT_COMMIT_RE.test(command);
}

type CommitToolDetails = {
	committed: boolean;
	reason?: "cancelled" | "interactive-approval-unavailable" | "approval-failed" | "nothing-staged" | "staged-changes-changed";
	hash?: string;
	subject?: string;
};

function notCommitted(text: string, reason: CommitToolDetails["reason"]) {
	return {
		content: [{ type: "text" as const, text }],
		details: { committed: false, reason } satisfies CommitToolDetails,
		terminate: true,
	};
}

function commandFailure(action: string, stdout: string, stderr: string): Error {
	const detail = stderr.trim() || stdout.trim() || "unknown git error";
	return new Error(`${action} failed: ${detail}`);
}

async function readStagedChanges(pi: ExtensionAPI, ctx: ExtensionContext, signal?: AbortSignal): Promise<string> {
	const result = await pi.exec("git", ["diff", "--cached", "--name-status"], {
		cwd: ctx.cwd,
		signal,
	});
	if (result.code !== 0) throw commandFailure("Reading staged changes", result.stdout, result.stderr);
	return result.stdout;
}

async function readStagedSnapshot(pi: ExtensionAPI, ctx: ExtensionContext, signal?: AbortSignal): Promise<string> {
	const result = await pi.exec("git", ["diff", "--cached", "--raw", "--no-abbrev"], {
		cwd: ctx.cwd,
		signal,
	});
	if (result.code !== 0) throw commandFailure("Reading the staged snapshot", result.stdout, result.stderr);
	return result.stdout;
}

function approvalMessage(message: string, stagedChanges: string): string {
	return `Commit message:\n\n${message}\n\nStaged changes:\n${stagedChanges.trimEnd()}`;
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, "").trim();
}

export function buildCommitPrompt(instructions: string): string {
	const workflow = stripFrontmatter(readFileSync(COMMIT_SKILL_PATH, "utf8"));
	const context = instructions.trim() || "No additional instructions; infer the narrow scope from the active task context.";
	return `${workflow}\n\n---\n\nAdditional user instructions:\n\n${context}`;
}

function emitCommitText(
	ctx: Pick<ExtensionCommandContext, "hasUI" | "ui">,
	message: string,
	level: "info" | "warning" | "error" = "info",
): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else console.log(message);
}

export default function registerCommitWorkflow(pi: ExtensionAPI): void {
	pi.registerCommand("commit", {
		description: "Prepare a context-scoped Conventional Commit with mandatory interactive confirmation",
		async handler(args, ctx) {
			const normalized = args.trim();
			if (normalized === "--help" || normalized === "-h") {
				emitCommitText(ctx, COMMIT_HELP);
				return;
			}
			if (!ctx.isIdle()) {
				emitCommitText(ctx, "Wait for the current agent turn to finish before starting /commit.", "warning");
				return;
			}
			if (planModeState(ctx.sessionManager.getBranch()) !== "inactive") {
				emitCommitText(ctx, "/commit is unavailable while Plan mode is active or indeterminate.", "warning");
				return;
			}
			try {
				pi.sendMessage(
					{
						customType: "guild-commit-workflow",
						content: buildCommitPrompt(args),
						display: false,
					},
					{ triggerTurn: true },
				);
			} catch (error) {
				emitCommitText(ctx, error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.registerTool({
		name: CREATE_COMMIT_TOOL_NAME,
		label: "Create Commit",
		description: "Create a git commit from staged changes after mandatory interactive user confirmation.",
		promptSnippet: "Create a staged git commit only after showing an interactive confirmation dialog",
		promptGuidelines: [
			"Use create_commit for every model-initiated git commit; never run git commit through bash.",
		],
		parameters: CREATE_COMMIT_PARAMETERS as never,
		executionMode: "sequential",
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const message = (params as unknown as { message: string }).message.trim();
			if (!message) throw new Error("Commit message cannot be empty.");

			if (!ctx.hasUI) {
				return notCommitted(
					"Commit not created: interactive approval is unavailable.",
					"interactive-approval-unavailable",
				);
			}

			const stagedChanges = await readStagedChanges(pi, ctx, signal);
			if (!stagedChanges.trim()) {
				return notCommitted("Commit not created: there is nothing staged.", "nothing-staged");
			}
			const approvedSnapshot = await readStagedSnapshot(pi, ctx, signal);

			let approved = false;
			try {
				approved = await ctx.ui.confirm("Create this git commit?", approvalMessage(message, stagedChanges));
			} catch {
				return notCommitted("Commit not created: interactive approval failed.", "approval-failed");
			}
			if (!approved) {
				return notCommitted(
					"Commit cancelled by the user; staged changes were left intact.",
					"cancelled",
				);
			}

			const currentSnapshot = await readStagedSnapshot(pi, ctx, signal);
			if (currentSnapshot !== approvedSnapshot) {
				return notCommitted(
					"Commit not created because the staged changes changed during approval. Review and confirm again.",
					"staged-changes-changed",
				);
			}

			const commit = await pi.exec("git", ["commit", "-m", message], { cwd: ctx.cwd, signal });
			if (commit.code !== 0) throw commandFailure("Creating the commit", commit.stdout, commit.stderr);

			const log = await pi.exec("git", ["log", "-1", "--format=%H%n%s"], { cwd: ctx.cwd, signal });
			if (log.code !== 0) throw commandFailure("Verifying the commit", log.stdout, log.stderr);
			const [hash = "", subject = ""] = log.stdout.trimEnd().split("\n");
			return {
				content: [{ type: "text" as const, text: `Created commit ${hash.slice(0, 12)}: ${subject}` }],
				details: { committed: true, hash, subject } satisfies CommitToolDetails,
			};
		},
	});

	pi.on("input", (event, ctx) => {
		if (!/^\/skill:conventional-commit\s+(?:--help|-h)$/u.test(event.text.trim())) return undefined;
		emitCommitText(ctx, COMMIT_HELP.replace("/commit", "/skill:conventional-commit"));
		return { action: "handled" as const };
	});

	pi.on("tool_call", (event) => {
		if (event.toolName !== "bash") return undefined;
		const command = (event.input as { command?: unknown }).command;
		if (typeof command !== "string" || !isDirectGitCommitCommand(command)) return undefined;
		return {
			block: true,
			reason: "Direct git commits are blocked. Use create_commit so the user receives interactive approval.",
		};
	});
}
