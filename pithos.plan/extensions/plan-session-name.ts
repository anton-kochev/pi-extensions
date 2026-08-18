import { basename } from "node:path";

const MAX_SESSION_NAME_LENGTH = 120;
const GENERIC_PLAN_TITLES = new Set([
	"bug-fix",
	"change",
	"changes",
	"feature",
	"implementation",
	"implementation-plan",
	"plan",
	"update",
	"updates",
]);

function toKebabCase(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/gu, "")
		.replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, MAX_SESSION_NAME_LENGTH)
		.replace(/-+$/gu, "");
}

function titleCandidate(content: string): string | undefined {
	const title = /^#(?!#)\s+(.+?)\s*$/mu.exec(content)?.[1];
	if (!title) return undefined;
	const candidate = toKebabCase(title.replace(/^plan\s*:\s*/iu, ""));
	return candidate && !GENERIC_PLAN_TITLES.has(candidate) ? candidate : undefined;
}

function pathCandidate(planPath: string): string | undefined {
	const readableName = /^\d{4}-\d{2}-\d{2}-\d{6}-(.+)\.md$/u.exec(basename(planPath))?.[1];
	if (!readableName) return undefined;
	const candidate = toKebabCase(readableName);
	return candidate && !GENERIC_PLAN_TITLES.has(candidate) ? candidate : undefined;
}

export function derivePlanSessionName(content: string, planPath: string): string {
	return titleCandidate(content) ?? pathCandidate(planPath) ?? "plan";
}
