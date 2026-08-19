import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import {
	Markdown,
	SelectList,
	Text,
	TruncatedText,
	type Component,
	type KeybindingsManager,
	type SelectItem,
} from "@earendil-works/pi-tui";

export type PlanPreviewDecision = "continue" | "create";

type PlanPreviewTheme = Pick<Theme, "bold" | "fg" | "italic" | "strikethrough" | "underline">;

function makeDraftTerminalSafe(content: string): string {
	return content.replace(/[\p{Cc}\p{Cf}]/gu, (character) => {
		if (character === "\n") return character;
		const codePoint = character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "0000";
		return `⟦U+${codePoint}⟧`;
	});
}

function createMarkdownTheme(theme: PlanPreviewTheme) {
	return {
		heading: (text: string) => theme.fg("mdHeading", text),
		link: (text: string) => theme.fg("mdLink", text),
		linkUrl: (text: string) => theme.fg("mdLinkUrl", text),
		code: (text: string) => theme.fg("mdCode", text),
		codeBlock: (text: string) => theme.fg("mdCodeBlock", text),
		codeBlockBorder: (text: string) => theme.fg("mdCodeBlockBorder", text),
		quote: (text: string) => theme.fg("mdQuote", text),
		quoteBorder: (text: string) => theme.fg("mdQuoteBorder", text),
		hr: (text: string) => theme.fg("mdHr", text),
		listBullet: (text: string) => theme.fg("mdListBullet", text),
		bold: (text: string) => theme.bold(text),
		italic: (text: string) => theme.italic(text),
		strikethrough: (text: string) => theme.strikethrough(text),
		underline: (text: string) => theme.underline(text),
	};
}

type PlanPreviewKeybindings = Pick<KeybindingsManager, "matches">;

export type PlanPreviewOptions = {
	content: string;
	planPath: string;
	terminalRows: () => number;
	theme: PlanPreviewTheme;
	keybindings: PlanPreviewKeybindings;
	onDecision: (decision: PlanPreviewDecision) => void;
	onRender: () => void;
};

const ACTIONS: SelectItem[] = [
	{ value: "continue", label: "Continue planning" },
	{ value: "create", label: "Create plan and start implementation" },
];

const CHROME_ROWS = 9;

export class PlanPreview implements Component {
	private readonly markdown: Markdown;
	private readonly actions: SelectList;
	private readonly topBorder: DynamicBorder;
	private readonly sectionBorder: DynamicBorder;
	private readonly bottomBorder: DynamicBorder;
	private readonly title: TruncatedText;
	private readonly path: TruncatedText;
	private readonly status: Text;
	private readonly help: TruncatedText;
	private readonly options: PlanPreviewOptions;
	private selectedIndex = 0;
	private scrollOffset = 0;
	private viewportRows = 1;
	private reviewAvailable = true;

	constructor(options: PlanPreviewOptions) {
		this.options = options;
		const { theme } = options;
		const borderColor = (text: string) => theme.fg("borderAccent", text);
		this.markdown = new Markdown(makeDraftTerminalSafe(options.content), 1, 0, createMarkdownTheme(theme));
		this.topBorder = new DynamicBorder(borderColor);
		this.sectionBorder = new DynamicBorder((text: string) => theme.fg("borderMuted", text));
		this.bottomBorder = new DynamicBorder(borderColor);
		this.title = new TruncatedText(theme.fg("accent", theme.bold("Review plan draft")), 1, 0);
		this.path = new TruncatedText(theme.fg("muted", `Target: ${options.planPath}`), 1, 0);
		this.status = new Text("", 1, 0);
		this.help = new TruncatedText(
			theme.fg("dim", "PgUp/PgDn or Space/b review • ↑↓ choose • Enter select • Esc continue"),
			1,
			0,
		);
		this.actions = new SelectList(ACTIONS, ACTIONS.length, {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});
		this.actions.setSelectedIndex(this.selectedIndex);
	}

	render(width: number): string[] {
		const terminalRows = Math.max(1, Math.floor(this.options.terminalRows()));
		const markdownLines = this.markdown.render(width);

		if (terminalRows < 4) {
			this.reviewAvailable = false;
			this.status.setText(this.options.theme.fg("warning", "Terminal too short to review; Enter or Esc continues planning"));
			return [...this.status.render(width), ...this.path.render(width), ...this.actions.render(width)].slice(0, terminalRows);
		}

		this.reviewAvailable = true;
		const compact = terminalRows < CHROME_ROWS + 1;
		this.viewportRows = compact ? terminalRows - 3 : terminalRows - CHROME_ROWS;
		const maxOffset = Math.max(0, markdownLines.length - this.viewportRows);
		this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
		const visibleDraft = markdownLines.slice(this.scrollOffset, this.scrollOffset + this.viewportRows);
		while (visibleDraft.length < this.viewportRows) visibleDraft.push("");

		if (compact) return [...this.path.render(width), ...visibleDraft, ...this.actions.render(width)];

		const firstVisible = markdownLines.length === 0 ? 0 : this.scrollOffset + 1;
		const lastVisible = Math.min(markdownLines.length, this.scrollOffset + this.viewportRows);
		this.status.setText(
			this.options.theme.fg("dim", `Draft lines ${firstVisible}–${lastVisible} of ${markdownLines.length}`),
		);

		return [
			...this.topBorder.render(width),
			...this.title.render(width),
			...this.path.render(width),
			...this.sectionBorder.render(width),
			...visibleDraft,
			...this.status.render(width),
			...this.actions.render(width),
			...this.help.render(width),
			...this.bottomBorder.render(width),
		];
	}

	handleInput(data: string): void {
		const { keybindings, onDecision, onRender } = this.options;
		if (keybindings.matches(data, "tui.select.cancel")) {
			onDecision("continue");
			return;
		}
		if (keybindings.matches(data, "tui.select.confirm")) {
			onDecision(
				this.reviewAvailable && ACTIONS[this.selectedIndex]?.value === "create" ? "create" : "continue",
			);
			return;
		}
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
			return;
		}
		if (keybindings.matches(data, "tui.select.pageUp") || data === "b") {
			this.scrollOffset = Math.max(0, this.scrollOffset - this.viewportRows);
			onRender();
			return;
		}
		if (keybindings.matches(data, "tui.select.pageDown") || data === " ") {
			this.scrollOffset += this.viewportRows;
			onRender();
		}
	}

	invalidate(): void {
		this.markdown.invalidate();
		this.actions.invalidate();
		this.topBorder.invalidate();
		this.sectionBorder.invalidate();
		this.bottomBorder.invalidate();
		this.title.invalidate();
		this.path.invalidate();
		this.status.invalidate();
		this.help.invalidate();
	}
}
