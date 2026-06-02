import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { formatArtifactList, loadTaskArtifact, taskFilePath } from "./artifact";
import { filterTasks, type Task } from "./tasks";

export async function showTaskList(ctx: ExtensionCommandContext): Promise<void> {
	const loaded = await loadTaskArtifact(taskFilePath(ctx.cwd));
	const tasks = filterTasks(loaded.artifact.tasks, "active");

	await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
		return new TaskListComponent(tasks, theme, () => done());
	});
}

export async function activeTaskListText(cwd: string): Promise<string> {
	const loaded = await loadTaskArtifact(taskFilePath(cwd));
	return formatArtifactList(loaded.artifact, "active");
}

class TaskListComponent {
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		private readonly tasks: Task[],
		private readonly theme: Theme,
		private readonly onClose: () => void,
	) {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || matchesKey(data, "q")) {
			this.onClose();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const th = this.theme;
		const lines: string[] = [];
		const add = (line = "") => lines.push(truncateToWidth(line, width));
		const activeCount = this.tasks.length;
		const doneCount = this.tasks.filter((task) => task.status === "done").length;

		add("");
		add(th.fg("borderMuted", "─".repeat(3)) + th.fg("accent", " Telos Tasks ") + th.fg("borderMuted", "─".repeat(Math.max(0, width - 16))));
		add("");
		add(`  ${th.fg("muted", `${activeCount} active task${activeCount === 1 ? "" : "s"}${doneCount ? ` · ${doneCount} done` : ""}`)}`);
		add("");

		if (this.tasks.length === 0) {
			add(`  ${th.fg("dim", "No active tasks. Create one with /tasks create \"Task title\".")}`);
		} else {
			for (const task of this.tasks) {
				const status = statusGlyph(task.status);
				const priority = priorityColor(task.priority, th);
				add(`  ${status} ${th.fg("accent", task.id)} ${priority} ${th.fg("text", task.title)}`);
				if (task.notes) add(`      ${th.fg("dim", task.notes)}`);
			}
		}

		add("");
		add(`  ${th.fg("dim", "Press Esc, Ctrl+C, or q to close. Use /tasks --help for commands.")}`);
		add("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

function statusGlyph(status: Task["status"]): string {
	switch (status) {
		case "done":
			return "✓";
		case "blocked":
			return "■";
		case "in_progress":
			return "◐";
		case "archived":
			return "◇";
		case "todo":
			return "○";
	}
}

function priorityColor(priority: Task["priority"], theme: Theme): string {
	const text = `(${priority})`;
	if (priority === "urgent") return theme.fg("error", text);
	if (priority === "high") return theme.fg("warning", text);
	if (priority === "low") return theme.fg("dim", text);
	return theme.fg("muted", text);
}
