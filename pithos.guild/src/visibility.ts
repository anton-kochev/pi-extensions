import type { GuildMemberName, GuildMemberSource } from "./agents";

export interface ActiveGuildRun {
	id: string;
	member: GuildMemberName;
	source: GuildMemberSource;
	role: "architect" | "coder";
	task: string;
	model: string;
	thinkingLevel: string;
	tools: readonly string[];
	startedAt: number;
	turns?: number;
}

function compactTask(task: string, maxLength = 120): string {
	const compact = task.replace(/\s+/g, " ").trim();
	return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
}

function elapsedSeconds(startedAt: number, now: number): string {
	return `${Math.max(0, Math.floor((now - startedAt) / 1000))}s`;
}

export class GuildRunTracker {
	private readonly runs = new Map<string, ActiveGuildRun>();

	get size(): number {
		return this.runs.size;
	}

	start(run: ActiveGuildRun): void {
		if (this.runs.has(run.id)) return;
		this.runs.set(run.id, { ...run, tools: [...run.tools] });
	}

	update(id: string, patch: Pick<ActiveGuildRun, "turns">): void {
		const current = this.runs.get(id);
		if (!current) return;
		this.runs.set(id, { ...current, ...patch });
	}

	finish(id: string): void {
		this.runs.delete(id);
	}

	clear(): void {
		this.runs.clear();
	}

	formatLines(now = Date.now()): string[] {
		if (this.runs.size === 0) return [];
		const lines = [`Guild · ${this.runs.size} active`];
		for (const run of this.runs.values()) {
			const permissions = run.role === "architect" ? "read-only" : "write-enabled";
			const turns = run.turns ? ` · ${run.turns} turn${run.turns === 1 ? "" : "s"}` : "";
			lines.push(`⏳ ${run.member} · ${run.source} · ${permissions} · ${elapsedSeconds(run.startedAt, now)}`);
			lines.push(`   Task: ${compactTask(run.task)}`);
			lines.push(`   Model: ${run.model} · thinking ${run.thinkingLevel}${turns}`);
			lines.push(`   Tools: ${run.tools.join(", ")}`);
		}
		return lines;
	}
}
