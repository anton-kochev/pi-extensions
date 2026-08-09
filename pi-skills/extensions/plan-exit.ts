export type PlanExitUI = {
	confirm(title: string, message: string): Promise<boolean>;
};

export type PlanExitDecision =
	| { action: "save"; instruction: string }
	| { action: "cancel" };

export type PlanExitCommandResult =
	| { action: "transform"; text: string }
	| { action: "handled" };

export async function confirmPlanExit(ui: PlanExitUI, planPath: string): Promise<PlanExitDecision> {
	const shouldSave = await ui.confirm("Exit Plan mode", "Create the plan file before exiting?");
	if (!shouldSave) return { action: "cancel" };

	return {
		action: "save",
		instruction: `Finalize the current plan and write it to exactly \`${planPath}\`. Do not begin implementation.`,
	};
}

export async function handlePlanExitCommand(
	ui: PlanExitUI,
	planPath: string,
	cancel: () => void,
): Promise<PlanExitCommandResult> {
	const decision = await confirmPlanExit(ui, planPath);
	if (decision.action === "save") return { action: "transform", text: decision.instruction };
	cancel();
	return { action: "handled" };
}
