import { resolve } from "node:path";

export type PlanToolInfo = {
	name: string;
	sourceInfo: {
		source: string;
		path: string;
	};
};

export const PLAN_CREATE_TOOL_NAME = "create_plan";

const PLAN_READ_TOOL_NAMES: readonly string[] = ["read", "grep", "find", "ls"];

export function isTrustedBuiltinTool(tools: PlanToolInfo[], name: string): boolean {
	return tools.some(
		(tool) =>
			tool.name === name && tool.sourceInfo.source === "builtin" && tool.sourceInfo.path === `<builtin:${name}>`,
	);
}

export function isTrustedPlanReadTool(tools: PlanToolInfo[], name: string): boolean {
	return PLAN_READ_TOOL_NAMES.includes(name) && isTrustedBuiltinTool(tools, name);
}

export function isTrustedPlanCreationTool(
	tools: PlanToolInfo[],
	name: string,
	planExtensionPath: string,
): boolean {
	return (
		name === PLAN_CREATE_TOOL_NAME &&
		tools.some(
			(tool) => tool.name === name && resolve(tool.sourceInfo.path) === resolve(planExtensionPath),
		)
	);
}

export function selectPlanModeTools(tools: PlanToolInfo[], planExtensionPath: string): string[] {
	const selected = PLAN_READ_TOOL_NAMES.filter((name) => isTrustedBuiltinTool(tools, name));
	if (isTrustedPlanCreationTool(tools, PLAN_CREATE_TOOL_NAME, planExtensionPath)) {
		selected.push(PLAN_CREATE_TOOL_NAME);
	}
	return selected;
}
