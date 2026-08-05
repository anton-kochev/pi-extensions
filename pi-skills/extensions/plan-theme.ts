import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	buildPlanCancellationMessage,
	buildPlanSystemPrompt,
	generatePlanPath,
	preparePlanMutation,
	resolvePlanCancellation,
} from "./plan-files.ts";
import { updatePlanStatus } from "./plan-status.ts";

const PLAN_COMMAND_RE = /^\/plan(?:\s|$)/;
const PLAN_THEME_NAME = "plan";
const FALLBACK_THEME_NAME = "dark";
const PLAN_STATUS_MESSAGE_TYPE = "plan-mode-status";

type PlanThemeState = {
	active: boolean;
	cancelled?: boolean;
	previousThemeName?: string;
	planPath?: string;
};

type PlanExitReason = "cancelled" | "saved";

export default function planTheme(pi: ExtensionAPI): void {
	let active = false;
	let cancelled = false;
	let previousThemeName: string | undefined;
	let planPath: string | undefined;

	function persistState(): void {
		pi.appendEntry("plan-theme-state", { active, cancelled, previousThemeName, planPath });
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

	function enablePlanTheme(
		ctx: ExtensionContext,
		generatedPlanPath: string,
		themeToRestore?: string,
	): void {
		if (active) return;

		const currentThemeName = ctx.ui.theme.name;
		previousThemeName =
			themeToRestore ??
			(currentThemeName && currentThemeName !== PLAN_THEME_NAME ? currentThemeName : FALLBACK_THEME_NAME);

		cancelled = false;
		if (!setThemeWithoutPersisting(ctx, PLAN_THEME_NAME)) {
			persistState();
			updatePlanStatus(ctx.ui, false);
			return;
		}

		active = true;
		planPath = generatedPlanPath;
		persistState();
		updatePlanStatus(ctx.ui, true);
	}

	function restorePreviousTheme(ctx: ExtensionContext, reason: PlanExitReason): void {
		if (!active) return;

		const themeToRestore = previousThemeName ?? FALLBACK_THEME_NAME;
		setThemeWithoutPersisting(ctx, themeToRestore) || setThemeWithoutPersisting(ctx, FALLBACK_THEME_NAME);

		active = false;
		cancelled = reason === "cancelled";
		previousThemeName = undefined;
		planPath = undefined;
		persistState();
		updatePlanStatus(ctx.ui, false);
		if (cancelled) sendCancellationNotice();
	}

	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		const states = entries
			.filter((entry) => entry.type === "custom" && entry.customType === "plan-theme-state")
			.map((entry) => (entry as { data?: PlanThemeState }).data)
			.filter((state): state is PlanThemeState => state !== undefined);
		const state = states.at(-1);

		active = state?.active ?? false;
		cancelled = await resolvePlanCancellation(ctx.cwd, states);
		previousThemeName = state?.previousThemeName;
		planPath = state?.planPath;

		if (active) {
			active = false;
			enablePlanTheme(
				ctx,
				planPath ?? (await generatePlanPath(ctx.cwd, CONFIG_DIR_NAME, "plan")),
				previousThemeName,
			);
		} else {
			if (state && state.cancelled === undefined) persistState();
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

		const text = event.text.trim();
		if (active && text === "/plan") {
			restorePreviousTheme(ctx, "cancelled");
			return { action: "handled" as const };
		}

		if (!active && PLAN_COMMAND_RE.test(text)) {
			const task = text.slice("/plan".length).trim();
			enablePlanTheme(ctx, await generatePlanPath(ctx.cwd, CONFIG_DIR_NAME, task));
		}
		return { action: "continue" as const };
	});

	pi.on("before_agent_start", async (event) => {
		const systemPrompt = buildPlanSystemPrompt(event.systemPrompt, { active, cancelled, planPath });
		return systemPrompt ? { systemPrompt } : undefined;
	});

	pi.on("tool_call", async (event) => {
		if (!active || !planPath) return undefined;
		preparePlanMutation(event.toolName, event.input, planPath);
		return undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!active || !planPath || event.isError) return undefined;
		if (preparePlanMutation(event.toolName, event.input, planPath)) restorePreviousTheme(ctx, "saved");
		return undefined;
	});
}
