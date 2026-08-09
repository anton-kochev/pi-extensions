export type PlanCreationUI = {
	confirm(title: string, message: string): Promise<boolean>;
};

export type PlanCreationDecision =
	| { action: "create"; instruction: string }
	| { action: "continue" };

export type ActivePlanCommandResult =
	| { action: "transform"; text: string }
	| { action: "handled" };

export async function confirmPlanCreation(ui: PlanCreationUI, planPath: string): Promise<PlanCreationDecision> {
	const shouldCreate = await ui.confirm(
		"Create plan and exit Plan mode",
		"Create the plan, exit read-only Plan mode, and begin implementation? Choose No to continue planning.",
	);
	if (!shouldCreate) return { action: "continue" };

	return {
		action: "create",
		instruction: `Finalize the current plan and call create_plan with its complete Markdown content for \`${planPath}\`. Once creation succeeds, implement the saved plan.`,
	};
}

export async function handleActivePlanCommand(
	ui: PlanCreationUI,
	planPath: string,
	setSaveAuthorization: (authorized: boolean) => void,
): Promise<ActivePlanCommandResult> {
	const decision = await confirmPlanCreation(ui, planPath);
	if (decision.action === "create") {
		setSaveAuthorization(true);
		return { action: "transform", text: decision.instruction };
	}
	setSaveAuthorization(false);
	return { action: "handled" };
}
