import { access } from "node:fs/promises";
import { basename, join, normalize, resolve } from "node:path";

const MAX_PLAN_NAME_LENGTH = 64;

function slugifyTask(task: string): string {
	return task
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_PLAN_NAME_LENGTH)
		.replace(/-+$/g, "");
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

function formatTimestamp(date: Date): string {
	return date.toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "");
}

export async function generatePlanPath(
	cwd: string,
	configDirectoryName: string,
	task: string,
	now = new Date(),
): Promise<string> {
	const readableName = slugifyTask(task) || "plan";
	let candidateTime = now;

	while (true) {
		const filename = `${formatTimestamp(candidateTime)}-${readableName}.md`;
		const relativePath = join(configDirectoryName, "plans", filename);
		if (!(await pathExists(resolve(cwd, relativePath)))) return relativePath;
		candidateTime = new Date(candidateTime.getTime() + 1_000);
	}
}

export type PersistedPlanState = {
	active: boolean;
	cancelled?: boolean;
	planPath?: string;
};

export async function resolvePlanCancellation(cwd: string, states: PersistedPlanState[]): Promise<boolean> {
	const latest = states.at(-1);
	if (!latest) return false;
	if (typeof latest.cancelled === "boolean") return latest.cancelled;
	if (latest.active) return false;

	const previousActive = [...states].reverse().find((state) => state.active && state.planPath);
	if (!previousActive?.planPath) return false;
	return !(await pathExists(resolve(cwd, previousActive.planPath)));
}

export function buildPlanCancellationMessage(): string {
	return "[PLAN MODE CANCELLED]\nPlan mode is now inactive. Ignore any earlier Plan Mode workflow instructions in the conversation history. Respond normally unless the user invokes /plan again.";
}

export type PlanPromptState = {
	active: boolean;
	cancelled: boolean;
	planPath?: string;
};

export function buildPlanSystemPrompt(systemPrompt: string, state: PlanPromptState): string | undefined {
	if (state.active && state.planPath) {
		return `${systemPrompt}\n\nWhen the plan is approved, save it at exactly \`${state.planPath}\`. Keep using that path for later plan updates.`;
	}
	if (state.cancelled) {
		return `${systemPrompt}\n\nPlan mode is inactive because the user cancelled it. Ignore any earlier Plan Mode workflow instructions in the conversation history. Respond normally unless the user invokes /plan again.`;
	}
	return undefined;
}

export function preparePlanMutation(toolName: string, input: unknown, planPath: string): boolean {
	if (toolName !== "write" && toolName !== "edit") return false;
	if (!input || typeof input !== "object") return false;

	const mutation = input as { path?: unknown };
	if (typeof mutation.path !== "string") return false;

	let mutationPath = mutation.path.trim().replace(/^@/, "");
	if (basename(normalize(mutationPath)) === "PLAN.md") {
		mutationPath = planPath;
		mutation.path = planPath;
	}

	return normalize(mutationPath) === normalize(planPath);
}
