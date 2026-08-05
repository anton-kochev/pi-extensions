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
