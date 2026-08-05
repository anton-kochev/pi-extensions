import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { generatePlanPath, preparePlanMutation } from "./plan-files.ts";

const PLAN_COMMAND_RE = /^\/plan(?:\s|$)/;
const PLAN_THEME_NAME = "plan";
const FALLBACK_THEME_NAME = "dark";

type PlanThemeState = {
	active: boolean;
	previousThemeName?: string;
	planPath?: string;
};

export default function planTheme(pi: ExtensionAPI): void {
	let active = false;
	let previousThemeName: string | undefined;
	let planPath: string | undefined;

	function persistState(): void {
		pi.appendEntry("plan-theme-state", { active, previousThemeName, planPath });
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

		if (!setThemeWithoutPersisting(ctx, PLAN_THEME_NAME)) return;

		active = true;
		planPath = generatedPlanPath;
		persistState();
	}

	function restorePreviousTheme(ctx: ExtensionContext): void {
		if (!active) return;

		const themeToRestore = previousThemeName ?? FALLBACK_THEME_NAME;
		const restored = setThemeWithoutPersisting(ctx, themeToRestore) || setThemeWithoutPersisting(ctx, FALLBACK_THEME_NAME);

		if (restored) {
			active = false;
			previousThemeName = undefined;
			planPath = undefined;
			persistState();
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		const entry = [...ctx.sessionManager.getEntries()]
			.reverse()
			.find((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-theme-state") as
			| { data?: PlanThemeState }
			| undefined;

		active = entry?.data?.active ?? false;
		previousThemeName = entry?.data?.previousThemeName;
		planPath = entry?.data?.planPath;

		if (active) {
			active = false;
			enablePlanTheme(
				ctx,
				planPath ?? (await generatePlanPath(ctx.cwd, CONFIG_DIR_NAME, "plan")),
				previousThemeName,
			);
		}
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" as const };

		const text = event.text.trim();
		if (active && text === "/plan") {
			restorePreviousTheme(ctx);
			return { action: "handled" as const };
		}

		if (!active && PLAN_COMMAND_RE.test(text)) {
			const task = text.slice("/plan".length).trim();
			enablePlanTheme(ctx, await generatePlanPath(ctx.cwd, CONFIG_DIR_NAME, task));
		}
		return { action: "continue" as const };
	});

	pi.on("before_agent_start", async (event) => {
		if (!active || !planPath) return undefined;
		return {
			systemPrompt: `${event.systemPrompt}\n\nWhen the plan is approved, save it at exactly \`${planPath}\`. Keep using that path for later plan updates.`,
		};
	});

	pi.on("tool_call", async (event) => {
		if (!active || !planPath) return undefined;
		preparePlanMutation(event.toolName, event.input, planPath);
		return undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!active || !planPath || event.isError) return undefined;
		if (preparePlanMutation(event.toolName, event.input, planPath)) restorePreviousTheme(ctx);
		return undefined;
	});
}
