import type { GuildMemberName } from "./agents";

export interface ActiveGuildRun {
	id: string;
	member: GuildMemberName;
	startedAt: number;
	turns?: number;
}

function elapsedTime(startedAt: number, now: number): string {
	let remainingSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
	const hours = Math.floor(remainingSeconds / 3600);
	remainingSeconds %= 3600;
	const minutes = Math.floor(remainingSeconds / 60);
	const seconds = remainingSeconds % 60;
	const parts: string[] = [];
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
	return parts.join(" ");
}

export class GuildRunTracker {
	private readonly runs = new Map<string, ActiveGuildRun>();

	get size(): number {
		return this.runs.size;
	}

	start(run: ActiveGuildRun): void {
		if (this.runs.has(run.id)) return;
		this.runs.set(run.id, { ...run });
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
			const turns = run.turns ? ` · ${run.turns} turn${run.turns === 1 ? "" : "s"}` : "";
			lines.push(`⏳ ${run.member} · ${elapsedTime(run.startedAt, now)}${turns}`);
		}
		return lines;
	}
}
