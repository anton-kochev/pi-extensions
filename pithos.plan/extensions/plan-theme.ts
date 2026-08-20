import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createPlanArgumentAutocompleteProvider } from "./plan-autocomplete.ts";
import {
	buildPlanCancellationMessage,
	buildPlanSystemPrompt,
	createPlanFileAtPath,
	generatePlanPath,
	resolveAvailablePlanPath,
	resolvePlanCancellation,
} from "./plan-files.ts";
import { confirmPlanCreation, handleActivePlanCommand } from "./plan-exit.ts";
import {
	isTrustedPlanCreationTool,
	isTrustedPlanReadTool,
	PLAN_CREATE_TOOL_NAME,
	selectPlanModeTools,
} from "./plan-policy.ts";
import { derivePlanSessionName } from "./plan-session-name.ts";
import { updatePlanStatus } from "./plan-status.ts";

const CONFIG_DIR_NAME = ".pi";
const PLAN_EXTENSION_PATH = fileURLToPath(import.meta.url);
const CREATE_PLAN_PARAMETERS = {
	type: "object",
	properties: {
		content: { type: "string", description: "Complete Markdown content for the approved plan" },
	},
	required: ["content"],
	additionalProperties: false,
} as const;
const PLAN_COMMAND_RE = /^\/plan(?:\s|$)/;
const PLAN_EXIT_COMMAND_RE = /^\/plan\s+(?:exit|cancel)$/;
const PLAN_THEME_NAME = "plan";
const FALLBACK_THEME_NAME = "dark";
const PLAN_STATUS_MESSAGE_TYPE = "plan-mode-status";

const PLAN_COMMAND_HELP = `Usage: /plan [task | exit | cancel | --help]

Arguments:
  no argument  Finalize the active plan and open interactive confirmation.
  task         Enter enforced read-only Plan mode for the given task.
  exit         Exit active Plan mode without creating a plan.
  cancel       Alias for exit.
  --help, -h   Show this help.`;

function planCommandHelp(input: string): string | undefined {
	return /^\/plan\s+(?:--help|-h)$/.test(input.trim()) ? PLAN_COMMAND_HELP : undefined;
}

function emitPackageCommandHelp(ctx: ExtensionContext, help: string): void {
	if (ctx.hasUI) ctx.ui.notify(help, "info");
	else console.log(help);
}

function withoutInternalPlanCreator(toolNames: string[]): string[] {
	return toolNames.filter((name) => name !== PLAN_CREATE_TOOL_NAME);
}

type PlanThemeState = {
	active: boolean;
	cancelled?: boolean;
	previousThemeName?: string;
	previousToolNames?: string[];
	planPath?: string;
	approvedContentDigest?: string;
};

function planContentDigest(content: string): string {
	return createHash("sha256").update(content, "utf8").digest("hex");
}

type PlanExitReason = "cancelled" | "saved";

export default function planTheme(pi: ExtensionAPI): void {
	let active = false;
	let cancelled = false;
	let approvedContentDigest: string | undefined;
	let planSaveToolCallId: string | undefined;
	let previousThemeName: string | undefined;
	let previousToolNames: string[] | undefined;
	let planPath: string | undefined;

	pi.registerTool({
		name: PLAN_CREATE_TOOL_NAME,
		label: "Create Plan",
		description: "Atomically create the approved generated plan without overwriting an existing plan.",
		parameters: CREATE_PLAN_PARAMETERS as never,
		executionMode: "sequential",
		async execute(toolCallId, params, _signal, _onUpdate, ctx) {
			const content = (params as unknown as { content: string }).content;
			if (
				!active ||
				toolCallId !== planSaveToolCallId ||
				!planPath ||
				approvedContentDigest !== planContentDigest(content)
			) {
				throw new Error("Plan creation is not currently authorized for this draft.");
			}
			try {
				const createdPath = await createPlanFileAtPath(ctx.cwd, planPath, content);
				return {
					content: [{ type: "text", text: `Created plan at ${createdPath}` }],
					details: { path: createdPath },
				};
			} catch (error) {
				if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
					planPath = await resolveAvailablePlanPath(ctx.cwd, planPath);
					approvedContentDigest = undefined;
					planSaveToolCallId = undefined;
					persistState();
				}
				throw error;
			}
		},
	});

	function persistState(): void {
		pi.appendEntry("plan-theme-state", {
			active,
			cancelled,
			previousThemeName,
			previousToolNames,
			planPath,
			approvedContentDigest,
		});
	}

	function sendCancellationNotice(): void {
		pi.sendMessage(
			{
				customType: PLAN_STATUS_MESSAGE_TYPE,
				content: buildPlanCancellationMessage(),
				display: false,
			},
			{ triggerTurn: false },
		);
	}

	function setThemeWithoutPersisting(ctx: ExtensionContext, themeName: string): boolean {
		const theme = ctx.ui.getTheme(themeName);
		if (!theme) {
			ctx.ui.notify(`Theme not found: ${themeName}`, "error");
			return false;
		}

		const result = ctx.ui.setTheme(theme);
		if (!result.success) {
			ctx.ui.notify(`Failed to switch to theme ${themeName}: ${result.error ?? "unknown error"}`, "error");
			return false;
		}

		return true;
	}

	function enablePlanMode(
		ctx: ExtensionContext,
		generatedPlanPath: string,
		themeToRestore?: string,
		toolsToRestore?: string[],
		restoredApprovedContentDigest?: string,
	): void {
		if (active) return;

		const currentThemeName = ctx.ui.theme.name;
		previousThemeName =
			themeToRestore ??
			(currentThemeName && currentThemeName !== PLAN_THEME_NAME ? currentThemeName : FALLBACK_THEME_NAME);

		cancelled = false;
		approvedContentDigest = restoredApprovedContentDigest;
		planSaveToolCallId = undefined;
		active = true;
		planPath = generatedPlanPath;
		previousToolNames = withoutInternalPlanCreator(toolsToRestore ?? pi.getActiveTools());
		pi.setActiveTools(selectPlanModeTools(pi.getAllTools(), PLAN_EXTENSION_PATH));
		setThemeWithoutPersisting(ctx, PLAN_THEME_NAME);
		persistState();
		updatePlanStatus(ctx.ui, true, () => pi.getSessionName());
	}

	function exitPlanMode(ctx: ExtensionContext, reason: PlanExitReason): void {
		if (!active) return;

		const themeToRestore = previousThemeName ?? FALLBACK_THEME_NAME;
		setThemeWithoutPersisting(ctx, themeToRestore) || setThemeWithoutPersisting(ctx, FALLBACK_THEME_NAME);

		active = false;
		cancelled = reason === "cancelled";
		approvedContentDigest = undefined;
		planSaveToolCallId = undefined;
		if (previousToolNames) pi.setActiveTools(withoutInternalPlanCreator(previousToolNames));
		previousToolNames = undefined;
		previousThemeName = undefined;
		planPath = undefined;
		persistState();
		updatePlanStatus(ctx.ui, false);
		if (cancelled) sendCancellationNotice();
	}

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode === "tui") ctx.ui.addAutocompleteProvider(createPlanArgumentAutocompleteProvider);

		if (active) {
			if (previousToolNames) pi.setActiveTools(withoutInternalPlanCreator(previousToolNames));
			if (previousThemeName) setThemeWithoutPersisting(ctx, previousThemeName);
		}

		const entries = ctx.sessionManager.getBranch();
		const states = entries
			.filter((entry) => entry.type === "custom" && entry.customType === "plan-theme-state")
			.map((entry) => (entry as { data?: PlanThemeState }).data)
			.filter((state): state is PlanThemeState => state !== undefined);
		const state = states.at(-1);

		active = state?.active ?? false;
		cancelled = await resolvePlanCancellation(ctx.cwd, states);
		previousThemeName = state?.previousThemeName;
		previousToolNames = state?.previousToolNames;
		planPath = state?.planPath;
		approvedContentDigest = state?.approvedContentDigest;

		if (active) {
			active = false;
			enablePlanMode(
				ctx,
				planPath ?? (await generatePlanPath(ctx.cwd, CONFIG_DIR_NAME, "plan")),
				previousThemeName,
				previousToolNames,
				approvedContentDigest,
			);
		} else {
			if (state && state.cancelled === undefined) persistState();
			pi.setActiveTools(withoutInternalPlanCreator(pi.getActiveTools()));
			updatePlanStatus(ctx.ui, false);
		}

		const hasCancellationNotice = entries.some(
			(entry) =>
				entry.type === "message" &&
				"message" in entry &&
				entry.message.role === "custom" &&
				entry.message.customType === PLAN_STATUS_MESSAGE_TYPE,
		);
		if (cancelled && !hasCancellationNotice) sendCancellationNotice();
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" as const };

		const commandHelp = planCommandHelp(event.text);
		if (commandHelp) {
			emitPackageCommandHelp(ctx, commandHelp);
			return { action: "handled" as const };
		}

		const text = event.text.trim();
		if (PLAN_COMMAND_RE.test(text) && (event.streamingBehavior || !ctx.isIdle())) {
			ctx.ui.notify("Wait for the current agent turn to finish before changing Plan mode.", "warning");
			return { action: "handled" as const };
		}
		if (PLAN_EXIT_COMMAND_RE.test(text)) {
			if (active) {
				exitPlanMode(ctx, "cancelled");
				if (ctx.hasUI) ctx.ui.notify("Exited Plan mode; no plan was created.", "info");
			} else if (ctx.hasUI) {
				ctx.ui.notify("Plan mode is not active.", "info");
			}
			return { action: "handled" as const };
		}
		if (active && text === "/plan") {
			if (!ctx.hasUI) {
				ctx.ui.notify("Creating the plan requires interactive approval; continuing Plan mode.", "warning");
				return { action: "handled" as const };
			}
			if (!planPath) {
				exitPlanMode(ctx, "cancelled");
				return { action: "handled" as const };
			}
			approvedContentDigest = undefined;
			planSaveToolCallId = undefined;
			persistState();
			return handleActivePlanCommand(planPath);
		}

		if (!active && PLAN_COMMAND_RE.test(text)) {
			const task = text.slice("/plan".length).trim();
			enablePlanMode(ctx, await generatePlanPath(ctx.cwd, CONFIG_DIR_NAME, task));
		}
		return { action: "continue" as const };
	});

	pi.on("before_agent_start", async (event) => {
		const systemPrompt = buildPlanSystemPrompt(event.systemPrompt, { active, cancelled, planPath });
		return systemPrompt ? { systemPrompt } : undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!active || !planPath) return undefined;
		if (planSaveToolCallId && planSaveToolCallId !== event.toolCallId) {
			return { block: true, reason: "The approved plan save is in progress; sibling tool calls are blocked." };
		}
		const allTools = pi.getAllTools();
		const isPlanCreation = isTrustedPlanCreationTool(allTools, event.toolName, PLAN_EXTENSION_PATH);
		const isTrustedRead = isTrustedPlanReadTool(allTools, event.toolName);
		if (isTrustedRead) return undefined;
		if (isPlanCreation) {
			const content = (event.input as { content?: unknown }).content;
			if (typeof content !== "string") {
				return { block: true, reason: "The plan draft must be complete Markdown text." };
			}
			if (!ctx.hasUI) {
				planSaveToolCallId = undefined;
				return { block: true, reason: "Creating the plan requires interactive approval." };
			}
			planSaveToolCallId = event.toolCallId;
			let availablePlanPath: string;
			try {
				availablePlanPath = await resolveAvailablePlanPath(ctx.cwd, planPath);
			} catch {
				planSaveToolCallId = undefined;
				return { block: true, reason: "The plan destination could not be resolved safely." };
			}
			if (availablePlanPath !== planPath) {
				planPath = availablePlanPath;
				approvedContentDigest = undefined;
				persistState();
			}
			const contentDigest = planContentDigest(content);
			if (approvedContentDigest !== contentDigest) {
				approvedContentDigest = undefined;
				planSaveToolCallId = event.toolCallId;
				persistState();
				let decision;
				try {
					decision = await confirmPlanCreation(ctx, planPath, content);
				} catch {
					planSaveToolCallId = undefined;
					return { block: true, reason: "Interactive plan approval failed; the plan was not created." };
				}
				if (decision.action === "continue") {
					planSaveToolCallId = undefined;
					return { block: true, reason: "The user chose to continue planning; the plan was not created." };
				}
				approvedContentDigest = contentDigest;
				persistState();
			}
			planSaveToolCallId = event.toolCallId;
			Object.freeze(event.input);
			Object.freeze(event);
			return undefined;
		}
		return { block: true, reason: "Plan mode is read-only; mutating tools are blocked." };
	});

	pi.on("user_bash", async () => {
		if (!active) return undefined;
		return {
			result: {
				output: "Plan mode is read-only; user shell commands are blocked until Plan mode exits.",
				exitCode: 126,
				cancelled: false,
				truncated: false,
			},
		};
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!active || !planPath || event.toolCallId !== planSaveToolCallId) return undefined;
		if (event.isError) {
			planSaveToolCallId = undefined;
			return undefined;
		}
		if (event.toolName === PLAN_CREATE_TOOL_NAME) {
			const content = (event.input as { content?: unknown }).content;
			const sessionName = derivePlanSessionName(typeof content === "string" ? content : "", planPath);
			exitPlanMode(ctx, "saved");
			pi.setSessionName(sessionName);
		}
		return undefined;
	});
}
