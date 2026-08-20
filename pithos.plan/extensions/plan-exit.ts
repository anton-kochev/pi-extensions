import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { PlanConfirmation, type PlanConfirmationDecision } from "./plan-confirmation.ts";
import { PlanPreview } from "./plan-preview.ts";

export type PlanCreationUI = {
	confirm: ExtensionUIContext["confirm"];
	custom?: ExtensionUIContext["custom"];
};

export type PlanCreationContext = {
	mode: "tui" | "rpc" | "json" | "print";
	hasUI: boolean;
	ui: PlanCreationUI;
};

export type PlanCreationDecision = { action: "create" } | { action: "continue" };

export type ActivePlanCommandResult = { action: "transform"; text: string };

function buildRpcReviewMessage(planPath: string, content: string): string {
	return [
		`Target: \`${planPath}\``,
		"",
		"Review the exact plan draft below. Approving creates this content, exits read-only Plan mode, and starts implementation.",
		"",
		"--- plan draft ---",
		content,
		"--- end plan draft ---",
	].join("\n");
}

async function showPlanConfirmation(
	custom: NonNullable<PlanCreationUI["custom"]>,
	planPath: string,
): Promise<PlanConfirmationDecision> {
	return custom<PlanConfirmationDecision>((tui, theme, keybindings, done) =>
		new PlanConfirmation({
			planPath,
			terminalRows: () => tui.terminal.rows,
			theme,
			keybindings,
			onDecision: done,
			onRender: () => tui.requestRender(),
		}),
	);
}

async function showPlanPreview(
	custom: NonNullable<PlanCreationUI["custom"]>,
	planPath: string,
	content: string,
): Promise<void> {
	await custom<void>((tui, theme, keybindings, done) =>
		new PlanPreview({
			content,
			planPath,
			terminalRows: () => tui.terminal.rows,
			theme,
			keybindings,
			onClose: () => done(undefined),
			onRender: () => tui.requestRender(),
		}),
	);
}

export async function confirmPlanCreation(
	context: PlanCreationContext,
	planPath: string,
	content: string,
): Promise<PlanCreationDecision> {
	if (!context.hasUI) return { action: "continue" };

	if (context.mode === "tui" && context.ui.custom) {
		while (true) {
			const decision = await showPlanConfirmation(context.ui.custom, planPath);
			if (decision === "preview") {
				await showPlanPreview(context.ui.custom, planPath, content);
				continue;
			}
			return decision === "create" ? { action: "create" } : { action: "continue" };
		}
	}

	if (context.mode === "rpc") {
		const shouldCreate = await context.ui.confirm("Review plan draft", buildRpcReviewMessage(planPath, content));
		return shouldCreate ? { action: "create" } : { action: "continue" };
	}

	return { action: "continue" };
}

export function handleActivePlanCommand(planPath: string): ActivePlanCommandResult {
	return {
		action: "transform",
		text: `Finalize the current plan and call create_plan with its complete Markdown content for \`${planPath}\`. Pi will open an interactive confirmation with an optional preview before creating it. Once creation succeeds, implement the saved plan.`,
	};
}
