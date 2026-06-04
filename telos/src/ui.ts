import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
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

type TaskListMode = "list" | "detail";

export class TaskListComponent {
	private cachedWidth?: number;
	private cachedLines?: string[];
	private selectedIndex = 0;
	private mode: TaskListMode = "list";

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

		if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
			this.toggleDetails();
			return;
		}

		if (this.mode === "detail") return;

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
		const addWrapped = (text: string, indent = "") => {
			const availableWidth = Math.max(1, width - visibleWidth(indent));
			for (const line of wrapTextWithAnsi(text, availableWidth)) {
				lines.push(`${indent}${line}`);
			}
		};

		if (this.mode === "detail" && this.tasks[this.selectedIndex]) {
			this.renderTaskDetails(add, addWrapped, width);
			this.cachedWidth = width;
			this.cachedLines = lines;
			return lines;
		}

		const activeCount = this.tasks.length;
		const doneCount = this.tasks.filter((task) => task.status === "done").length;

		add("");
		add(headerLine("Telos Tasks", width, th));
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
		add(`  ${th.fg("dim", "Use ↑/↓ to navigate, Enter/Space for details. Esc, Ctrl+C, or q closes.")}`);
		add("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private renderTaskDetails(add: (line?: string) => void, addWrapped: (text: string, indent?: string) => void, width: number): void {
		const task = this.tasks[this.selectedIndex];
		const th = this.theme;
		const description = task.notes.trim();

		add("");
		add(headerLine(task.id, width, th));
		add("");
		add(`  ${th.fg("text", task.title)}`);
		add(`  ${statusGlyph(task.status)} ${task.status} · ${priorityGlyph(task.priority)} ${task.priority}`);

		if (description) {
			add("");
			add(`  ${detailLabel("Description", th)}`);
			addWrapped(description, "  ");
		}

		if (task.dependencies.length > 0) {
			add("");
			add(`  ${detailLabel("Dependencies", th)}`);
			for (const dependencyId of task.dependencies) {
				add(`  ${formatDependency(dependencyId, this.tasks, th)}`);
			}
		}

		add("");
		add(`  ${detailLabel("Created", th)}  ${formatTaskDate(task.created)}`);
		add(`  ${detailLabel("Updated", th)}  ${formatTaskDate(task.updated)}`);
		add("");
		add(`  ${th.fg("dim", "Press Enter/Space to return. Press Esc, Ctrl+C, or q to close.")}`);
		add("");
	}

	private moveSelection(delta: number): void {
		if (this.tasks.length === 0) return;

		const nextIndex = Math.max(0, Math.min(this.tasks.length - 1, this.selectedIndex + delta));
		if (nextIndex === this.selectedIndex) return;

		this.selectedIndex = nextIndex;
		this.invalidate();
		this.requestRender();
	}

	private toggleDetails(): void {
		if (this.tasks.length === 0) return;
		this.mode = this.mode === "list" ? "detail" : "list";
		this.invalidate();
		this.requestRender();
	}
}

function headerLine(label: string, width: number, theme: Theme): string {
	const left = theme.fg("borderMuted", "─".repeat(3));
	const title = theme.fg("accent", ` ${label} `);
	const rightWidth = Math.max(0, width - visibleWidth(left) - visibleWidth(title));
	return left + title + theme.fg("borderMuted", "─".repeat(rightWidth));
}

function detailLabel(label: string, theme: Theme): string {
	return theme.fg("muted", label);
}

function formatTaskDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;

	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

function formatDependency(dependencyId: string, tasks: Task[], theme: Theme): string {
	const dependency = tasks.find((entry) => entry.id === dependencyId);
	if (!dependency) return theme.fg("dim", dependencyId);

	return `${statusGlyph(dependency.status)} ${dependency.id}  ${priorityGlyph(dependency.priority)}  ${dependency.title}`;
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
