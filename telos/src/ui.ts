import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { formatArtifactList, loadTaskArtifact, taskFilePath } from "./artifact";
import { filterTasks, type Task } from "./tasks";

export async function showTaskList(ctx: ExtensionCommandContext): Promise<void> {
	const loaded = await loadTaskArtifact(taskFilePath(ctx.cwd));
	const tasks = filterTasks(loaded.artifact.tasks, "active");

	await ctx.ui.custom<void>((tui, theme, _kb, done) => {
		return new TaskListComponent(tasks, theme, () => done(), () => tui.requestRender());
	});
}

export async function activeTaskListText(cwd: string): Promise<string> {
	const loaded = await loadTaskArtifact(taskFilePath(cwd));
	return formatArtifactList(loaded.artifact, "active");
}

export class TaskListComponent {
	private cachedWidth?: number;
	private cachedLines?: string[];
	private selectedIndex = 0;

	constructor(
		private readonly tasks: Task[],
		private readonly theme: Theme,
		private readonly onClose: () => void,
		private readonly requestRender: () => void = () => {},
	) {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || matchesKey(data, "q")) {
			this.onClose();
			return;
		}

		if (matchesKey(data, Key.up)) {
			this.moveSelection(-1);
			return;
		}

		if (matchesKey(data, Key.down)) {
			this.moveSelection(1);
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
			for (let index = 0; index < this.tasks.length; index++) {
				const task = this.tasks[index];
				const selected = index === this.selectedIndex;
				const isDone = task.status === "done";
				const pointer = selected ? th.fg("accent", "›") : " ";
				const status = isDone ? th.fg("dim", statusGlyph(task.status)) : statusGlyph(task.status);
				const id = isDone ? th.fg("dim", task.id) : th.fg("accent", task.id);
				const priority = isDone ? th.fg("dim", priorityGlyph(task.priority)) : priorityColor(task.priority, th);
				const title = isDone ? th.fg("dim", task.title) : th.fg("text", task.title);
				const dependency = dependencyIndicator(task, th);
				const prefix = `${pointer} ${status} ${id} ${priority} `;
				const suffix = dependency ? `  ${dependency}` : "";
				const titleWidth = Math.max(0, width - visibleWidth(prefix) - visibleWidth(suffix));
				add(`${prefix}${truncateToWidth(title, titleWidth, "…")}${suffix}`);
			}
		}

		add("");
		add(`  ${th.fg("dim", "Use ↑/↓ to navigate. Press Esc, Ctrl+C, or q to close.")}`);
		add("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private moveSelection(delta: number): void {
		if (this.tasks.length === 0) return;

		const nextIndex = Math.max(0, Math.min(this.tasks.length - 1, this.selectedIndex + delta));
		if (nextIndex === this.selectedIndex) return;

		this.selectedIndex = nextIndex;
		this.invalidate();
		this.requestRender();
	}
}

function statusGlyph(status: Task["status"]): string {
	switch (status) {
		case "todo":
			return "□";
		case "in_progress":
			return "▣";
		case "blocked":
			return "▧";
		case "done":
			return "■";
		case "archived":
			return "▫";
	}
}

function dependencyIndicator(task: Task, theme: Theme): string {
	if (task.dependencies.length === 0) return "";
	return theme.fg("dim", `◂${task.dependencies.length}`);
}

function priorityColor(priority: Task["priority"], theme: Theme): string {
	const glyph = priorityGlyph(priority);
	switch (priority) {
		case "urgent":
			return theme.fg("error", glyph);
		case "high":
			return theme.fg("warning", glyph);
		case "medium":
			return theme.fg("muted", glyph);
		case "low":
			return theme.fg("dim", glyph);
	}
}

function priorityGlyph(priority: Task["priority"]): string {
	switch (priority) {
		case "urgent":
			return "●●●";
		case "high":
			return "●●○";
		case "medium":
			return "●○○";
		case "low":
			return "○○○";
	}
}
