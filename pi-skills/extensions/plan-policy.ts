export type PlanToolInfo = {
	name: string;
	sourceInfo: {
		source: string;
		path: string;
	};
};

const PLAN_READ_TOOL_NAMES: readonly string[] = ["read", "grep", "find", "ls"];
const PLAN_MODE_TOOL_NAMES = [...PLAN_READ_TOOL_NAMES, "write"];

export function isTrustedBuiltinTool(tools: PlanToolInfo[], name: string): boolean {
	return tools.some(
		(tool) =>
			tool.name === name && tool.sourceInfo.source === "builtin" && tool.sourceInfo.path === `<builtin:${name}>`,
	);
}

export function isTrustedPlanReadTool(tools: PlanToolInfo[], name: string): boolean {
	return PLAN_READ_TOOL_NAMES.includes(name) && isTrustedBuiltinTool(tools, name);
}

export function selectPlanModeTools(tools: PlanToolInfo[]): string[] {
	return PLAN_MODE_TOOL_NAMES.filter((name) => isTrustedBuiltinTool(tools, name));
}
