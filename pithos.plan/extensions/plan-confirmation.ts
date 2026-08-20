import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import {
	SelectList,
	Text,
	TruncatedText,
	truncateToWidth,
	type Component,
	type KeybindingsManager,
	type SelectItem,
} from "@earendil-works/pi-tui";

export type PlanConfirmationDecision = "continue" | "preview" | "create";

type PlanConfirmationTheme = Pick<Theme, "bold" | "fg">;
type PlanConfirmationKeybindings = Pick<KeybindingsManager, "getKeys" | "matches">;

export type PlanConfirmationOptions = {
	planPath: string;
	terminalRows: () => number;
	theme: PlanConfirmationTheme;
	keybindings: PlanConfirmationKeybindings;
	onDecision: (decision: PlanConfirmationDecision) => void;
	onRender: () => void;
};

const ACTIONS: SelectItem[] = [
	{ value: "continue", label: "Continue planning" },
	{ value: "preview", label: "Preview the plan" },
	{ value: "create", label: "Create plan and start implementation" },
];

const MIN_CONFIRMATION_WIDTH = 20;

const KEY_LABELS: Record<string, string> = {
	up: "↑",
	down: "↓",
	enter: "Enter",
	return: "Return",
	escape: "Esc",
};

export class PlanConfirmation implements Component {
	private readonly actions: SelectList;
	private readonly topBorder: DynamicBorder;
	private readonly bottomBorder: DynamicBorder;
	private readonly status: Text;
	private readonly options: PlanConfirmationOptions;
	private title: TruncatedText;
	private path: TruncatedText;
	private help: TruncatedText;
	private selectedIndex = 0;
	private actionableRendered = false;

	constructor(options: PlanConfirmationOptions) {
		this.options = options;
		const { theme } = options;
		const borderColor = (text: string) => theme.fg("borderAccent", text);
		this.topBorder = new DynamicBorder(borderColor);
		this.bottomBorder = new DynamicBorder(borderColor);
		this.status = new Text("", 1, 0);
		this.title = new TruncatedText("", 1, 0);
		this.path = new TruncatedText("", 1, 0);
		this.help = new TruncatedText("", 1, 0);
		this.refreshThemedText();
		this.actions = new SelectList(ACTIONS, ACTIONS.length, {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});
		this.actions.setSelectedIndex(this.selectedIndex);
	}

	private keyLabel(action: "tui.select.up" | "tui.select.down" | "tui.select.confirm" | "tui.select.cancel"): string {
		const key = String(this.options.keybindings.getKeys(action)[0] ?? "");
		return KEY_LABELS[key] ?? key;
	}

	private refreshThemedText(): void {
		const { theme } = this.options;
		const up = this.keyLabel("tui.select.up");
		const down = this.keyLabel("tui.select.down");
		const confirm = this.keyLabel("tui.select.confirm");
		const cancel = this.keyLabel("tui.select.cancel");
		this.title = new TruncatedText(theme.fg("accent", theme.bold("Plan ready — what next?")), 1, 0);
		this.path = new TruncatedText(theme.fg("muted", `Target: ${this.options.planPath}`), 1, 0);
		this.help = new TruncatedText(
			theme.fg("dim", `${up}/${down} choose • ${confirm} select • ${cancel} continue`),
			1,
			0,
		);
	}

	private availableRows(): number {
		return Math.max(1, Math.floor(this.options.terminalRows()) - 1);
	}

	private canConfirm(): boolean {
		return this.availableRows() >= 4;
	}

	private fit(lines: string[], width: number, availableRows: number): string[] {
		return lines
			.slice(0, Math.min(8, availableRows))
			.map((line) => truncateToWidth(line, Math.max(0, width), ""));
	}

	render(width: number): string[] {
		this.actionableRendered = false;
		const availableRows = this.availableRows();
		if (!this.canConfirm() || width < MIN_CONFIRMATION_WIDTH) {
			const confirm = this.keyLabel("tui.select.confirm");
			const cancel = this.keyLabel("tui.select.cancel");
			this.status.setText(
				this.options.theme.fg(
					"warning",
					`${confirm}/${cancel}: continue planning; terminal too short for confirmation`,
				),
			);
			return this.fit(
				[...this.status.render(width), ...this.path.render(width), ...this.help.render(width)],
				width,
				availableRows,
			);
		}
		this.actionableRendered = true;
		const core = [...this.path.render(width), ...this.actions.render(width)];
		if (availableRows === 4) return this.fit(core, width, availableRows);
		if (availableRows === 5) {
			return this.fit([...this.title.render(width), ...core], width, availableRows);
		}
		if (availableRows === 6) {
			return this.fit([...this.title.render(width), ...core, ...this.help.render(width)], width, availableRows);
		}
		if (availableRows === 7) {
			return this.fit(
				[...this.topBorder.render(width), ...this.title.render(width), ...core, ...this.help.render(width)],
				width,
				availableRows,
			);
		}
		return this.fit(
			[
				...this.topBorder.render(width),
				...this.title.render(width),
				...core,
				...this.help.render(width),
				...this.bottomBorder.render(width),
			],
			width,
			availableRows,
		);
	}

	handleInput(data: string): void {
		const { keybindings, onDecision, onRender } = this.options;
		if (keybindings.matches(data, "tui.select.cancel")) {
			onDecision("continue");
			return;
		}
		if (keybindings.matches(data, "tui.select.confirm")) {
			onDecision(
				this.actionableRendered && this.canConfirm()
					? (ACTIONS[this.selectedIndex]?.value as PlanConfirmationDecision)
					: "continue",
			);
			return;
		}
		if (!this.actionableRendered || !this.canConfirm()) return;
		if (keybindings.matches(data, "tui.select.up")) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.actions.setSelectedIndex(this.selectedIndex);
			onRender();
			return;
		}
		if (keybindings.matches(data, "tui.select.down")) {
			this.selectedIndex = Math.min(ACTIONS.length - 1, this.selectedIndex + 1);
			this.actions.setSelectedIndex(this.selectedIndex);
			onRender();
		}
	}

	invalidate(): void {
		this.actions.invalidate();
		this.topBorder.invalidate();
		this.bottomBorder.invalidate();
		this.status.invalidate();
		this.refreshThemedText();
	}
}
