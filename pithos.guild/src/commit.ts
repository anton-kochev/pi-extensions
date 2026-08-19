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
		noVerify: {
			type: "boolean",
			description: "Bypass git hooks only when the user explicitly requested --no-verify",
		},
	},
	required: ["message"],
	additionalProperties: false,
} as const;

// Conservative defense in depth for model-issued shell commands. This deliberately
// recognizes common wrappers, but shell text matching is not a security sandbox.
const SHELL_BOUNDARY = String.raw`(?:^|&&|\|\||[;|\n])\s*\(?\s*`;
const ENV_ARGUMENT = String.raw`(?:-[^\s;&|]+|[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s;&|]+))`;
const COMMAND_WRAPPERS = String.raw`(?:exec\s+)?(?:command\s+)?(?:env(?:\s+${ENV_ARGUMENT})*\s+)?(?:command\s+)?`;
const GIT_EXECUTABLE = String.raw`(?:git|"/[^"\n]*/git"|'/[^'\n]*/git'|/[^\s;&|]*/git)`;
const GIT_GLOBAL_OPTIONS = String.raw`(?:\s+(?:(?:-C|-c)\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)|--(?:git-dir|work-tree|namespace)(?:=(?:"[^"]*"|'[^']*'|[^\s;&|]+)|\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+))|--(?:bare|no-pager|paginate)))*`;
const DIRECT_GIT_COMMIT_RE = new RegExp(
	`${SHELL_BOUNDARY}${COMMAND_WRAPPERS}${GIT_EXECUTABLE}${GIT_GLOBAL_OPTIONS}\\s+commit(?:\\s|$)`,
	"m",
);
const NESTED_SHELL_RE = new RegExp(
	`${SHELL_BOUNDARY}${COMMAND_WRAPPERS}(?:/(?:[^\\s;&|]*/)*?)?(?:ba|da|z|k)?sh\\s+(?:--?[^\\s;&|]+\\s+)*?-[A-Za-z]*c[A-Za-z]*\\s+(?:"([^"]*)"|'([^']*)')`,
	"gm",
);

function containsDirectGitCommit(command: string, depth: number): boolean {
	if (DIRECT_GIT_COMMIT_RE.test(command)) return true;
	if (depth >= 8) return false;
	NESTED_SHELL_RE.lastIndex = 0;
	for (const match of command.matchAll(NESTED_SHELL_RE)) {
		const nestedCommand = match[1] ?? match[2];
		if (nestedCommand && containsDirectGitCommit(nestedCommand, depth + 1)) return true;
	}
	return false;
}

export function isDirectGitCommitCommand(command: string): boolean {
	return containsDirectGitCommit(command, 0);
}

type CommitToolDetails = {
	committed: boolean;
	reason?:
		| "cancelled"
		| "interactive-approval-unavailable"
		| "approval-failed"
		| "nothing-staged"
		| "staged-changes-changed"
		| "repository-head-changed"
		| "merge-in-progress"
		| "commit-reconciliation-required";
	hash?: string;
	target?: string;
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

async function runGit(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	action: string,
	args: string[],
	signal?: AbortSignal,
): Promise<string> {
	const result = await pi.exec("git", args, { cwd: ctx.cwd, signal });
	if (result.code !== 0) throw commandFailure(action, result.stdout, result.stderr);
	return result.stdout;
}

async function readTreeDiff(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	action: string,
	args: string[],
	signal?: AbortSignal,
): Promise<string> {
	return runGit(pi, ctx, action, ["diff", ...args], signal);
}

async function readStagedTree(pi: ExtensionAPI, ctx: ExtensionContext, signal?: AbortSignal): Promise<string> {
	return (await runGit(pi, ctx, "Reading the staged tree", ["write-tree"], signal)).trim();
}

type HeadIdentity =
	| { kind: "symbolic"; ref: string; hash: string | null }
	| { kind: "detached"; hash: string | null };

async function readRefHash(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	ref: string,
	signal?: AbortSignal,
): Promise<string | null> {
	const result = await pi.exec("git", ["rev-parse", "--verify", "--quiet", ref], {
		cwd: ctx.cwd,
		signal,
	});
	if (result.code === 1) return null;
	if (result.code !== 0) throw commandFailure(`Reading ${ref}`, result.stdout, result.stderr);
	return result.stdout.trim();
}

async function readHeadIdentity(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	signal?: AbortSignal,
): Promise<HeadIdentity> {
	const symbolic = await pi.exec("git", ["symbolic-ref", "--quiet", "HEAD"], {
		cwd: ctx.cwd,
		signal,
	});
	if (symbolic.code === 0) {
		const ref = symbolic.stdout.trim();
		if (!ref) throw new Error("Reading HEAD identity failed: symbolic HEAD ref is empty.");
		return { kind: "symbolic", ref, hash: await readRefHash(pi, ctx, ref, signal) };
	}
	if (symbolic.code !== 1) throw commandFailure("Reading HEAD identity", symbolic.stdout, symbolic.stderr);
	return { kind: "detached", hash: await readRefHash(pi, ctx, "HEAD", signal) };
}

function sameHeadIdentity(left: HeadIdentity, right: HeadIdentity): boolean {
	return left.kind === right.kind
		&& (left.kind === "detached" || (right.kind === "symbolic" && left.ref === right.ref))
		&& left.hash === right.hash;
}

function sameHeadTarget(left: HeadIdentity, right: HeadIdentity): boolean {
	return left.kind === right.kind
		&& (left.kind === "detached" || (right.kind === "symbolic" && left.ref === right.ref));
}

async function hasActiveMerge(pi: ExtensionAPI, ctx: ExtensionContext, signal?: AbortSignal): Promise<boolean> {
	const result = await pi.exec("git", ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
		cwd: ctx.cwd,
		signal,
	});
	if (result.code === 0) return true;
	if (result.code === 1) return false;
	throw commandFailure("Checking for an active merge", result.stdout, result.stderr);
}

async function readBaselineTree(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	head: string | null,
	signal?: AbortSignal,
): Promise<string> {
	const args = head === null
		? ["hash-object", "-t", "tree", "--stdin"]
		: ["rev-parse", "--verify", `${head}^{tree}`];
	return (await runGit(pi, ctx, "Reading the approved baseline tree", args, signal)).trim();
}

type ParsedCommit = { tree: string; parents: string[]; message: string };

function parseCommitObject(content: string): ParsedCommit {
	const separator = content.indexOf("\n\n");
	if (separator < 0) throw new Error("Verifying the commit failed: malformed commit object.");
	const headers = content.slice(0, separator).split("\n");
	const tree = headers.find((header) => header.startsWith("tree "))?.slice(5);
	if (!tree) throw new Error("Verifying the commit failed: commit tree is missing.");
	const parents = headers
		.filter((header) => header.startsWith("parent "))
		.map((header) => header.slice(7));
	return { tree, parents, message: content.slice(separator + 2) };
}

function hasApprovedParents(commit: ParsedCommit, approvedHead: string | null): boolean {
	return approvedHead === null
		? commit.parents.length === 0
		: commit.parents.length === 1 && commit.parents[0] === approvedHead;
}

function expectedCommitMessage(message: string): string {
	return message.endsWith("\n") ? message : `${message}\n`;
}

function reconciliationRequired(target: string, hash: string | undefined, detail: string) {
	const observed = hash ? `${target} at ${hash}` : target;
	return {
		content: [{
			type: "text" as const,
			text: `Commit outcome requires manual reconciliation for ${observed}: ${detail} The controlled workflow did not attempt ref recovery or rollback. Git or hooks may already have advanced the captured target; inspect the refs, index, and worktree before retrying to avoid duplicate commits.`,
		}],
		details: {
			committed: false,
			reason: "commit-reconciliation-required",
			...(hash ? { hash } : {}),
			target,
		} satisfies CommitToolDetails,
		terminate: true,
	};
}

function approvalMessage(message: string, stagedFiles: string, noVerify: boolean): string {
	const hookWarning = noVerify
		? "⚠ HOOKS WILL BE BYPASSED (--no-verify) because this was explicitly requested.\n\n"
		: "";
	return `${hookWarning}Commit message:\n\n${message}\n\nStaged files:\n${stagedFiles.trimEnd()}`;
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
			"Set noVerify only when the user explicitly requests bypassing git hooks.",
		],
		parameters: CREATE_COMMIT_PARAMETERS as never,
		executionMode: "sequential",
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const input = params as unknown as { message: string; noVerify?: boolean };
			const message = input.message;
			const noVerify = input.noVerify === true;
			if (!message.trim()) throw new Error("Commit message cannot be empty.");

			if (!ctx.hasUI) {
				return notCommitted(
					"Commit not created: interactive approval is unavailable.",
					"interactive-approval-unavailable",
				);
			}

			if (await hasActiveMerge(pi, ctx, signal)) {
				return notCommitted(
					"Commit not created: an active merge is in progress. The user must resolve or complete the merge outside this controlled normal-commit workflow.",
					"merge-in-progress",
				);
			}

			// Capture both approval anchors before rendering. Every displayed byte is then
			// derived from immutable Git objects rather than from the mutable index.
			const approvedHead = await readHeadIdentity(pi, ctx, signal);
			const capturedTarget = approvedHead.kind === "symbolic" ? approvedHead.ref : "HEAD";
			const baselineTree = await readBaselineTree(pi, ctx, approvedHead.hash, signal);
			const approvedTree = await readStagedTree(pi, ctx, signal);
			const stagedFiles = await readTreeDiff(
				pi,
				ctx,
				"Reading staged files",
				["--name-status", baselineTree, approvedTree],
				signal,
			);
			if (!stagedFiles.trim()) {
				return notCommitted("Commit not created: there is nothing staged.", "nothing-staged");
			}

			let approved = false;
			try {
				approved = await ctx.ui.confirm(
					"Create this git commit?",
					approvalMessage(message, stagedFiles, noVerify),
					{ signal },
				);
			} catch {
				if (signal?.aborted) signal.throwIfAborted();
				return notCommitted("Commit not created: interactive approval failed.", "approval-failed");
			}
			if (!approved) {
				return notCommitted(
					"Commit cancelled by the user; staged changes were left intact.",
					"cancelled",
				);
			}

			signal?.throwIfAborted();
			const currentHead = await readHeadIdentity(pi, ctx, signal);
			const currentTree = await readStagedTree(pi, ctx, signal);
			if (!sameHeadIdentity(currentHead, approvedHead)) {
				return notCommitted(
					"Commit not created because HEAD changed during approval. Review the repository and confirm again.",
					"repository-head-changed",
				);
			}
			if (currentTree !== approvedTree) {
				return notCommitted(
					"Commit not created because the staged changes changed during approval. Review and confirm again.",
					"staged-changes-changed",
				);
			}
			if (await hasActiveMerge(pi, ctx, signal)) {
				return notCommitted(
					"Commit not created: an active merge is in progress. The user must resolve or complete the merge outside this controlled normal-commit workflow.",
					"merge-in-progress",
				);
			}

			// This is the mutation boundary. From this point through reconciliation, no
			// abort signal is passed: a possibly-created commit must always be accounted for.
			signal?.throwIfAborted();
			const commitArgs = [
				"commit",
				"--cleanup=verbatim",
				...(noVerify ? ["--no-verify"] : []),
				"-m",
				message,
			];
			const commit = await pi.exec("git", commitArgs, { cwd: ctx.cwd });

			let hash: string | null = null;
			let observedHead: HeadIdentity;
			try {
				hash = approvedHead.kind === "symbolic"
					? await readRefHash(pi, ctx, approvedHead.ref)
					: null;
				observedHead = await readHeadIdentity(pi, ctx);
				if (approvedHead.kind === "detached") {
					if (observedHead.kind !== "detached") {
						return reconciliationRequired(
							capturedTarget,
							observedHead.hash ?? undefined,
							"Detached HEAD identity changed while Git was creating the commit, so the observed transition cannot be attributed safely.",
						);
					}
					hash = observedHead.hash;
				}
			} catch (error) {
				return reconciliationRequired(
					capturedTarget,
					hash ?? undefined,
					`${error instanceof Error ? error.message : String(error)}.`,
				);
			}

			const headIdentityChanged = !sameHeadTarget(observedHead, approvedHead);
			if (hash === approvedHead.hash) {
				if (commit.code !== 0 && !headIdentityChanged) {
					throw commandFailure("Creating the commit", commit.stdout, commit.stderr);
				}
				return reconciliationRequired(
					capturedTarget,
					hash ?? undefined,
					headIdentityChanged
						? "HEAD identity changed while Git was creating the commit, and the captured target did not advance."
						: "Git reported success but the captured target did not advance.",
				);
			}
			if (hash === null) {
				return reconciliationRequired(
					capturedTarget,
					undefined,
					"The captured target became unborn while Git was creating the commit.",
				);
			}
			if (commit.code !== 0) {
				return reconciliationRequired(
					capturedTarget,
					hash,
					"Git reported failure after the captured target advanced, so this invocation cannot safely claim or roll back the transition.",
				);
			}

			let committed: ParsedCommit;
			try {
				const object = await runGit(pi, ctx, "Verifying the commit", ["cat-file", "commit", hash]);
				committed = parseCommitObject(object);
			} catch (error) {
				return reconciliationRequired(
					capturedTarget,
					hash,
					`${error instanceof Error ? error.message : String(error)}.`,
				);
			}

			if (!hasApprovedParents(committed, approvedHead.hash)) {
				return reconciliationRequired(
					capturedTarget,
					hash,
					"The captured target commit is not the single-parent transition from the approved HEAD, so ownership is ambiguous.",
				);
			}

			const matchesApproval = committed.tree === approvedTree
				&& committed.message === expectedCommitMessage(message);

			if (!matchesApproval) {
				return reconciliationRequired(
					capturedTarget,
					hash,
					"The observed root or single-parent transition did not match the approved tree and exact message, so it cannot be cryptographically tied to this invocation.",
				);
			}

			if (headIdentityChanged) {
				return reconciliationRequired(
					capturedTarget,
					hash,
					"The observed transition matches the approval, but HEAD identity changed; ordinary success would be ambiguous.",
				);
			}

			let finalHash: string | null;
			let finalHead: HeadIdentity;
			try {
				finalHash = approvedHead.kind === "symbolic"
					? await readRefHash(pi, ctx, approvedHead.ref)
					: null;
				finalHead = await readHeadIdentity(pi, ctx);
				if (approvedHead.kind === "detached") finalHash = finalHead.hash;
			} catch (error) {
				return reconciliationRequired(
					capturedTarget,
					hash,
					`${error instanceof Error ? error.message : String(error)}.`,
				);
			}
			if (finalHash !== hash || finalHead.hash !== hash || !sameHeadTarget(finalHead, approvedHead)) {
				return reconciliationRequired(
					capturedTarget,
					finalHash ?? undefined,
					"The captured target or HEAD identity changed again before verification completed.",
				);
			}

			const [subject = ""] = message.split("\n");
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
